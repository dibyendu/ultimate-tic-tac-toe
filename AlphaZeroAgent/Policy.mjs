import * as tf from '@tensorflow/tfjs'

class ActionProbabilityLayer extends tf.layers.Layer {

  #outputShape

  constructor(config) {
    super(config)
    this.name = config.name
    this.#outputShape = config.targetShape
  }

  computeOutputShape(inputShape) {
    return [inputShape[0], this.#outputShape]
  }

  /*
   * call() contains the actual numerical computation of the layer
   *
   * It is "tensor-in-tensor-out". I.e., it receives one or more
   * tensors as the input and should produce one or more tensors as the return value
   *
   * Be sure to use tidy() to avoid WebGL memory leak 
   */
  call(inputs) {
    return tf.tidy(() => {

      let [logits, available] = inputs[0].split([this.#outputShape, -1], 1)

      let exp = available.mul(logits.exp())

      let probability = exp.div(exp.sum(1).reshape([-1, 1]))

      return probability
    })
  }

  // getConfig() generates the JSON object that is used when saving and loading the custom layer object
  getConfig() {
    const config = super.getConfig()
    Object.assign(config, { targetShape: this.#outputShape })
    return config
  }

  // The static className getter is required by the registration step
  static get className() {
    return 'ActionProbabilityLayer'
  }
}

// Regsiter the custom layer, so TensorFlow.js knows what class constructor to call when deserializing an saved instance of the custom layer
tf.serialization.registerClass(ActionProbabilityLayer)



export class Policy {

  #model
  #learning_rate
  #regularization_factor

  resnet_block(input) {
    let identity = input

    input = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(input)

    input = tf.layers.dense({
      units: 1024,
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(input)

    input = tf.layers.add().apply([input, identity])

    input = tf.layers.reLU().apply(input)

    return input
  }

  constructor(n_state, n_action, learning_rate = 1e-2, regularization_factor = 1e-4) {
    this.#learning_rate = learning_rate
    this.#regularization_factor = regularization_factor

    let state = tf.input({ shape: n_state, dtype: 'float32', name: 'State' }),
      available_action_mask = tf.input({ shape: [n_action], dtype: 'float32', name: 'AvailableActions' })

    let logits = tf.layers.dense({
      units: 1024,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(state)

    // 12 resnet blocks
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)
    logits = this.resnet_block(logits)

    let policy_hidden_1 = tf.layers.dense({
      units: 512,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(logits)

    let policy_hidden_2 = tf.layers.dense({
      units: n_action,
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(policy_hidden_1)

    let policy = new ActionProbabilityLayer({
      name: 'ActionProbabilities',
      targetShape: n_action
    }).apply(
      tf.layers.concatenate().apply([policy_hidden_2, available_action_mask])
    )

    let value_hidden = tf.layers.dense({
      units: 512,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(logits)

    let value = tf.layers.dense({
      units: 1,
      activation: 'tanh',
      name: 'Value',
      kernelRegularizer: tf.regularizers.l2({
        l2: this.#regularization_factor
      })
    }).apply(value_hidden)

    this.#model = tf.model({
      inputs: [state, available_action_mask],
      outputs: [policy, value]
    })

    this.compile()
  }

  compile() {
    this.#model.compile({
      optimizer: tf.train.rmsprop(this.#learning_rate),
      loss: {
        ActionProbabilities: (truth, prediction) => {
          let constant = truth.add(Number.EPSILON).log().mul(truth)
          return prediction.add(Number.EPSILON).log().mul(truth).sub(constant).sum(1).neg().sum()
        },
        Value: (truth, prediction) => prediction.squaredDifference(truth).sum()
      },
      metrics: {
        // ActionProbabilities: 'accuracy',
        Value: 'mse'
      }
    })
  }

  set model(m) {
    this.#model = m
  }

  summary() {
    this.#model.summary()
  }

  predict(input) {
    return this.#model.predict(input)
  }

  evaluate(input, output) {
    return this.#model.evaluate(input, output)
  }

  async fit(input, output, options) {
    return await this.#model.fit(input, output, options)
  }

  getWeights() {
    return this.#model.getWeights()
  }

  async save(location) {
    await this.#model.save(location)
  }

  load(model) {
    this.model = model
    this.compile()
  }
}