'use strict';

const redis = require('redis');
const helpers = require('./helpers');
const lua = require('./lua');

async function createClient(settings, createNew) {
  let client;
  if (isClient(settings)) {
    // We assume it's a redis client from either node_redis or ioredis.
    client = settings;

    if (createNew) {
      // Both node_redis and ioredis support the duplicate method, which creates
      // a new redis client with the same configuration.
      client = client.duplicate();
    } else if (isReady(client)) {
      // If we were given a redis client, and we don't want to clone it (to
      // enable connection sharing between Queue instances), and it's already
      // ready, then just return it.
      return Promise.resolve(client);
    } // otherwise, we wait for the client to be in the ready state.
  } else {
    // node_redis mutates the options object we provide it, so we clone the
    // settings first.
    if (typeof settings === 'object') {
      settings = Object.assign({}, settings);
    }

    const scripts = await lua.readScripts().then((result) => result);
    // eslint-disable-next-line no-console
    // console.log('scripts:', typeof scripts.checkStalledJobs, typeof scripts.addJob, typeof scripts.raiseDelayedJobs, typeof scripts.addDelayedJob, typeof scripts.removeJob);
    const clientDefaultParams = {
      legacyMode: true,
      scripts: {
        checkStalledJobs: redis.defineScript({
          NUMBER_OF_KEYS: 4,
          SCRIPT: scripts.checkStalledJobs,
          transformArguments(key, func) {
            return [key, func.toString()];
          },
          transformReply(reply) {
            return reply;
          },
        }),
        addJob: redis.defineScript({
          NUMBER_OF_KEYS: 3,
          SCRIPT: scripts.addJob,
          transformArguments(key, func) {
            return [key, func.toString()];
          },
          transformReply(reply) {
            return reply;
          },
        }),
        raiseDelayedJobs: redis.defineScript({
          NUMBER_OF_KEYS: 2,
          SCRIPT: scripts.raiseDelayedJobs,
          transformArguments(key, func) {
            return [key, func.toString()];
          },
          transformReply(reply) {
            return reply;
          },
        }),
        addDelayedJob: redis.defineScript({
          NUMBER_OF_KEYS: 4,
          SCRIPT: scripts.addDelayedJob,
          transformArguments(key, func) {
            return [key, func.toString()];
          },
          transformReply(reply) {
            return reply;
          },
        }),
        removeJob: redis.defineScript({
          NUMBER_OF_KEYS: 7,
          SCRIPT: scripts.removeJob,
          transformArguments(key, func) {
            return [key, func.toString()];
          },
          transformReply(reply) {
            return reply;
          },
        }),
      },
    };

    if (settings) {
      client = redis.createClient(Object.assign(settings, clientDefaultParams));
    } else {
      client = redis.createClient(clientDefaultParams);
    }

    client.connect();
  }

  // Wait for the client to be ready, then resolve with the client itself.
  return helpers.waitOn(client, 'ready', true).then(
    () => client,
    // If we receive an error before the client becomes ready, we won't retain a
    // reference to it, so we should disconnect the client to prevent uncaught
    // exceptions.
    (err) => (disconnect(client), Promise.reject(err))
  );
}

function disconnect(client) {
  // Redis#end is deprecated for ioredis.
  /* istanbul ignore if: this is only for ioredis */
  if (client.disconnect) {
    client.disconnect();
  } else {
    // true indicates that it should invoke all pending callbacks with an
    // AbortError; we need this behavior.
    client.end(true);
  }
}

function isAbortError(err) {
  // node_redis has a designated class for abort errors, but ioredis just has
  // a constant message defined in a utils file.
  return (
    err.name === 'AbortError' ||
    /* istanbul ignore next: this is only for ioredis */
    err.message === 'Connection is closed.'
  );
}

function isClient(object) {
  if (!object || typeof object !== 'object') return false;
  const name = object.constructor.name;
  return name === 'Redis' || name === 'RedisClient';
}

function isReady(client) {
  // node_redis has a ready property, ioredis has a status property.
  return client.ready || client.status === 'ready';
}

exports.createClient = createClient;
exports.disconnect = disconnect;
exports.isAbortError = isAbortError;
exports.isClient = isClient;
exports.isReady = isReady;
