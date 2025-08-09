FROM mcr.microsoft.com/devcontainers/base:ubuntu

RUN wget https://nodejs.org/dist/v12.22.10/node-v12.22.10-linux-x64.tar.xz
RUN tar -xvf node-v12.22.10-linux-x64.tar.xz
RUN rm -rf node-v12.22.10-linux-x64.tar.xz && mv node-v12.22.10-linux-x64 node

RUN curl -fsSL https://deno.land/install.sh | sh -s -- --yes
RUN mv /root/.deno /.deno

ENV PATH="$PATH:/node/bin:/.deno/bin"