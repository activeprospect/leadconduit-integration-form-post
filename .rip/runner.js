
// Lambda Integration Runner

const _ = require('lodash');
const Promise = require('bluebird');
// const request = Promise.promisify(require('request'), { multiArgs: true });
const Parser = require('leadconduit-integration').test.types.parser;
const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
AWSXRay.captureHTTPsGlobal(require('http'));

let integration;

function handler (integrationObj, event, context, callback) {
  let response;

  integration = integrationObj;

  // If invoked via a warmup event, we're done
  if (isWarmupEvent(event)) {
    callback(null, 'function is warm');
    return;
  }

  getInput(event)
    .then(validate)
    .then(run)
    .then(processResults)
    .then(results => {
      console.log('responding');
      response = buildResponse(results);
      console.log(response);
      callback(null, response);
    })
    .catch(IntegrationError, e => {
      console.log('caught integration error');
      response = e.buildResponse();
      callback(null, response);
    })
    .catch(e => {
      console.log('caught exception');
      callback(e);
    });
}

function isWarmupEvent (event) {
  return (event.source === 'serverless-plugin-warmup');
}

function getInput (event) {
  console.log('in getInput', event);

  // While a promise isn't necessary here, it is cleaner to start the chain here
  return new Promise((resolve, reject) => {
    let body;

    try {
      // TODO: for SQS need to handle multiple records

      // If from API gateway
      if (event.httpMethod) {
        const b = JSON.parse(event.body);
        const parser = Parser(integration.request.variables());
        body = parser(b);
      }

      // If from SQS
      else if (event.Records) {
        body = JSON.parse(event.Records[0].body);
        console.log('sqs body', body);
      }

      // Direct
      else {
        body = event;
      }

      if (!body) {
        reject(new IntegrationError(400, 'no body'));
        return;
      }
    } catch (e) {
      reject(new IntegrationError(400, 'parse failed'));
      return;
    }

    console.log('integration', integration);
    console.log('BODY', body);
    resolve(body);
  });
}

function validate (vars) {
  console.log('in validate');

  if (!_.isFunction(integration.validate)) {
    console.log('optional validate function not found');
    return vars;
  }

  const message = integration.validate(vars);
  if (message) {
    console.log(message);
    throw new IntegrationError(422, 'validation failed', { message });
  }
  return vars;
}

function run (vars) {
  console.log('in run');

  return new Promise((resolve, reject) => {
    if (!_.isFunction(integration.handle)) {
      throw new IntegrationError(400, 'Handle is not a function');
    }

    integration.handle(vars, (err, append) => {
      console.log('in run callback, err:', err);
      console.log('in run callback, append:', append);
      if (err && !(err instanceof Error)) {
        console.log(err);
        reject(new IntegrationError(400, 'Error returned by integration must be an instance of Error'));
      }

      if (!append) {
        reject(new IntegrationError(400, 'No event returned from integration'));
      }

      resolve(append);
    });
  });
}

function processResults (results) {
  console.log('in processResults', results);
  return new Promise((resolve, reject) => {
    resolve(results);
  });
}

function buildResponse (results) {
  const response = {
    statusCode: 200,
    body: JSON.stringify(results)
  };
  return response;
}

class IntegrationError extends Error {
  constructor (statusCode, message = 'unknown error', body = {}) {
    super();
    this.statusCode = statusCode;
    this.message = message;
    this.body = body;
  }

  buildResponse () {
    const outcome = 'error';
    const reason = this.message;
    const stack = this.stack.split('\n');
    const event = { outcome, reason };
    const integration = this.body;
    const response = {
      statusCode: this.statusCode,
      body: JSON.stringify({ event, integration: { stack, integration } })
    };
    return response;
  }
}

module.exports = handler;
