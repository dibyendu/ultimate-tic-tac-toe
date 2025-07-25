import fs from 'fs'
import { fileURLToPath } from 'url'
import * as tf from '@tensorflow/tfjs-node'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'

import { Game } from './Game.mjs'
import { MCTS } from './MCTS.mjs'
import { Policy } from './Policy.mjs'


const LEARNING_RATE = 5e-5, // 1e-4
  REGULARIZATION_FACTOR = 1e-4,
  EXPLORATION_DEPTH = 200,
  TEMPERATURE = 0.1

const N_TRAINING_ITERATIONS = 400,
  EPISODES_PER_TRAINING_ITERATION = 10,
  N_THREADS = 14,
  N_EPOCHES_DURING_TRAINING = 5,
  VALIDATION_SPLIT = 0.05,
  INCLUDE_TIED_GAMES = false,
  EVALUATE_EVERY = 5,
  N_EVALUATION_GAMES = 4,
  COMPETE_AGAINST_MODEL_FROM_N_ITERATIONS_BACK = 50,
  MODEL_DIRECTORY = 'trained_model'


const CONTEXT = {
  score: null,  // null -> game on,  0 -> draw, +1/-1 -> winner
  current_player: 1,
  last_move: null,
  board: new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0).map(() => new Array(3).fill(0)))),
  acquired: new Array(3).fill(0).map(() => new Array(3).fill(0))
}

const policy = new Policy(MCTS.n_states, MCTS.n_actions, LEARNING_RATE, REGULARIZATION_FACTOR)

function play_game(exploration_depth, temperature) {
  let game_tree = new MCTS(new Game(CONTEXT)),
    steps = 0,
    nn_inputs = [],
    true_probs = [],
    players = []

  while (game_tree.outcome == null) {
    for (let _ of [...Array(exploration_depth).keys()])
      game_tree.explore(policy)

    let [game_tree_next, { nn_input, true_prob }] = game_tree.next(temperature)

    players.push(game_tree.game.player)
    nn_inputs.push(nn_input)
    true_probs.push(true_prob)

    game_tree_next.detachMother()
    game_tree = game_tree_next

    steps += 1
  }

  return { outcome: game_tree.outcome, steps, players, nn_inputs, true_probs }
}


async function evaluate(iteration, logs) {

  let old_policy = new Policy(MCTS.n_states, MCTS.n_actions, LEARNING_RATE, REGULARIZATION_FACTOR)

  if (fs.existsSync(`./${MODEL_DIRECTORY}_${iteration - COMPETE_AGAINST_MODEL_FROM_N_ITERATIONS_BACK}/model.json`))
    old_policy.load(await tf.loadLayersModel(`file://./${MODEL_DIRECTORY}_${iteration - COMPETE_AGAINST_MODEL_FROM_N_ITERATIONS_BACK}/model.json`))

  let player_score = 0, opponent_score = 0

  for (let gid = 1; gid <= N_EVALUATION_GAMES; gid++) {
    console.time('Execution time')

    let game_tree = new MCTS(new Game(CONTEXT)), current_player = 1, steps = 0

    while (game_tree.outcome == null) {
      for (let _ of [...Array(EXPLORATION_DEPTH).keys()])
        game_tree.explore(((gid % 2 == 1 && current_player == 1) || (gid % 2 == 0 && current_player == -1)) ? policy : old_policy)

      let [game_tree_next, _] = game_tree.next(TEMPERATURE)

      game_tree_next.detachMother()
      game_tree = new MCTS(game_tree_next.game.clone())

      current_player *= -1
      steps += 1
    }

    if (game_tree.outcome == 0) {
      player_score += 0.5
      opponent_score += 0.5
    } else if ((game_tree.outcome == 1 && gid % 2 == 1) || (game_tree.outcome == -1 && gid % 2 == 0)) {
      player_score += 1
    } else {
      opponent_score += 1
    }

    logs.evaluation.push({ outcome: game_tree.outcome, steps, model_player: gid % 2 == 1 ? 'x' : 'o' })

    console.log(`Evaluation Game #${gid.toString().padStart(3, '0')}:\t Winner: ${game_tree.outcome == 1 ? 'x' : (game_tree.outcome == -1 ? 'o' : '-')} (${steps.toString().padStart(3, '0')} steps)\t Latest model plays as: ${gid % 2 == 1 ? 'x' : 'o'}`)

    console.timeEnd('Execution time')
  }

  let K = 16,
    Ra = logs.player_elo[logs.player_elo.length - 1],
    Rb = logs.opponent_elo[logs.opponent_elo.length - 1],
    Ea = 1 / (1 + 10 ** ((Rb - Ra) / 400)),
    Eb = 1 / (1 + 10 ** ((Ra - Rb) / 400))

  logs.player_elo.push(Ra + K * (player_score - N_EVALUATION_GAMES * Ea))
  logs.opponent_elo.push(Rb + K * (opponent_score - N_EVALUATION_GAMES * Eb))
}


function train(iteration, logs, episode, nn_inputs_for_all_episodes, true_probs_for_all_episodes, outcomes_for_all_episodes) {

  let threads = new Set([...Array(N_THREADS).keys()].map(_ => new Worker(fileURLToPath(import.meta.url), { workerData: { exploration_depth: EXPLORATION_DEPTH, temperature: TEMPERATURE } })))

  for (let worker of threads) {
    worker.on('error', error => { throw error })
    worker.on('exit', () => {
      threads.delete(worker)
      if (threads.size == 0 && episode < EPISODES_PER_TRAINING_ITERATION) {
        console.timeEnd(`Execution time for ${N_THREADS} threads`)
        console.time(`Execution time for ${N_THREADS} threads`)
        train(iteration, logs, episode, nn_inputs_for_all_episodes, true_probs_for_all_episodes, outcomes_for_all_episodes)
      }
    })
    worker.on('message', ({ outcome, steps, players, nn_inputs, true_probs }) => {
      if (episode < EPISODES_PER_TRAINING_ITERATION && (outcome || INCLUDE_TIED_GAMES)) {
        nn_inputs_for_all_episodes = nn_inputs_for_all_episodes.concat(nn_inputs.slice(1))
        true_probs_for_all_episodes = true_probs_for_all_episodes.concat(true_probs.slice(1))
        outcomes_for_all_episodes = outcomes_for_all_episodes.concat(players.map(p => [p * -1 * outcome]).slice(1))
        episode += 1
      }

      console.log(`Game #${episode.toString().padStart(3, '0')}:\t Winner: ${outcome == 1 ? 'x' : (outcome == -1 ? 'o' : '-')} (${steps.toString().padStart(3, '0')} steps)${!(outcome || INCLUDE_TIED_GAMES) ? ' skipped from training' : ''}`)

      if (episode >= EPISODES_PER_TRAINING_ITERATION) {

        for (let worker of threads) worker.terminate()

        console.timeEnd(`Execution time for ${N_THREADS} threads`)

        let states = tf.stack(nn_inputs_for_all_episodes.map(({ state }) => state)),
          availabilities = tf.stack(nn_inputs_for_all_episodes.map(({ availability }) => availability)),
          probabilities = tf.stack(true_probs_for_all_episodes),
          outcomes = tf.stack(outcomes_for_all_episodes)

        policy.fit(
          [states, availabilities],
          [probabilities, outcomes],
          {
            epochs: N_EPOCHES_DURING_TRAINING,
            verbose: 0,
            validationSplit: VALIDATION_SPLIT,
            shuffle: true,
            callbacks: {
              onTrainBegin: _ => {
                console.group()
                console.log('Training the model ...')
              },
              onEpochEnd: (epoch, logs) => console.log(`Epoch ${(epoch + 1).toString().padStart(3, ' ')} / ${N_EPOCHES_DURING_TRAINING.toString().padStart(3, ' ')}:\t Loss: ${logs.loss.toFixed(10).padStart(14, '0')}\t Policy Loss: ${logs.ActionProbabilities_loss.toFixed(10).padStart(14, '0')}\t Value Loss: ${logs.Value_loss.toFixed(10).padStart(14, '0')}`)
            }
          }
        ).then(({ history }) => {
          logs.training.push(Object.assign({}, ...Object.entries(history).map(([key, val]) => ({ [key]: [Math.max(...val), val.reduce((a, b) => a + b, 0) / val.length, Math.min(...val)] }))))
          policy.save(`file://./${MODEL_DIRECTORY}`).then(async () => {
            console.log('Model saved')
            console.groupEnd()

            if (iteration % EVALUATE_EVERY == 0) {
              if (iteration >= COMPETE_AGAINST_MODEL_FROM_N_ITERATIONS_BACK) {
                console.group()
                console.log('Evaluating the model ...')
                await evaluate(iteration, logs)
                console.log('Evaluation done')
                console.groupEnd()
              }
              if (!fs.existsSync(`./${MODEL_DIRECTORY}_${iteration}`))
                fs.mkdirSync(`./${MODEL_DIRECTORY}_${iteration}`)
              fs.copyFileSync(`./${MODEL_DIRECTORY}/model.json`, `./${MODEL_DIRECTORY}_${iteration}/model.json`)
              fs.copyFileSync(`./${MODEL_DIRECTORY}/weights.bin`, `./${MODEL_DIRECTORY}_${iteration}/weights.bin`)
            }
            fs.writeFileSync(`./${MODEL_DIRECTORY}/logs.json`, JSON.stringify({ iteration, logs }))

            iteration += 1
            if (iteration <= N_TRAINING_ITERATIONS) {
              console.log(`Iteration #${iteration}`)
              console.time(`Execution time for ${N_THREADS} threads`)
              train(iteration, logs, 0, [], [], [])
            }
          })
        })
      }
    })
  }
}


(async function() {
  if (!isMainThread) {
    let { outcome, steps, players, nn_inputs, true_probs } = play_game(workerData.exploration_depth, workerData.temperature)
    parentPort.postMessage({ outcome, steps, players, nn_inputs, true_probs })
  } else {
    let last_iteration = 0,
      logs = { training: [], evaluation: [], player_elo: [1500], opponent_elo: [1500] }

    if (fs.existsSync(`./${MODEL_DIRECTORY}/model.json`)) {
      let past = JSON.parse(fs.readFileSync(`./${MODEL_DIRECTORY}/logs.json`))
      last_iteration = past.iteration
      logs = past.logs
      policy.load(await tf.loadLayersModel(`file://./${MODEL_DIRECTORY}/model.json`))
      logs.training.forEach((history, id) => console.log(`Iteration #${(id + 1).toString().padStart(5, '0')}:\t Loss: ${history.loss[1].toFixed(10).padStart(14, '0')}\t Action Loss: ${history.ActionProbabilities_loss[1].toFixed(10).padStart(14, '0')}\t Value Loss: ${history.Value_loss[1].toFixed(10).padStart(14, '0')}`))
      logs.evaluation.forEach((history, id) => console.log(`Evaluation Game #${(id + 1).toString().padStart(3, '0')}:\t Winner: ${history.outcome == 1 ? 'x' : (history.outcome == -1 ? 'o' : '-')} (${history.steps.toString().padStart(3, '0')} steps)\t Latest model plays as: ${history.model_player}`))
    }

    policy.summary()

    if (last_iteration + 1 <= N_TRAINING_ITERATIONS) {
      console.log(`Iteration #${last_iteration + 1}`)
      console.time(`Execution time for ${N_THREADS} threads`)
      train(last_iteration + 1, logs, 0, [], [], [])
    }
  }
})()