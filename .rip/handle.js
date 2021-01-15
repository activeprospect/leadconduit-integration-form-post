
// Lambda integration handle generator

const _ = require('lodash');
const dotaccess = require('dotaccess');
const string = require('underscore.string');
const path = require('path');
const request = require('request');
const fields = require('leadconduit-fields');

const packages = {};
const modules = {};
const integrations = {};

const maxTimeout = 360;
const minTimeout = 1;

function create (functionName) {
  var api, i, id, integration, len, modulePath, name, paths, pkg, ref, ref1, results;
  api = require(path.resolve('.'));
  pkg = require(path.resolve('./package.json'));

  // Remove UI
  delete api.ui;

  paths = findPaths(api);
  name = pkg.name;
  name = name.replace(/^@activeprospect\//, '');
  module.exports[name] = api;
  packages[name] = {
    name: (ref = api.name) != null ? ref : _.capitalize(name.replace('leadconduit-', '')),
    version: pkg.version,
    description: pkg.description,
    repo_url: pkg.repository.url,
    paths: paths
  };
  results = {};
  for (i = 0, len = paths.length; i < len; i++) {
    modulePath = paths[i];
    id = name + '.' + modulePath;
    const shortName = id.split('.').pop();
    if (functionName === shortName) {
      integration = (ref1 = dotaccess.get(api, modulePath)) != null ? ref1 : api[modulePath];
      return register(id, integration);
    }
  }
  return results;
}

function register (id, integration) {
  generateModule(id, integration);
  generateHandle(integration);
  generateTypes(id, integration);
  generateAppendPrefix(id, integration);
  integrations[id] = integration;
  integration.name = id;
  return integration;
}

// function deregister (id) {
//   return delete integrations[id];
// }

// function lookup (moduleId) {
//   return integrations[moduleId];
// }

function ensureTimeout (timeout) {
  timeout = Number(timeout).valueOf();
  if (!_.isFinite(timeout)) {
    return maxTimeout;
  }
  if (timeout > maxTimeout) {
    return maxTimeout;
  }
  if (timeout < minTimeout) {
    return minTimeout;
  }
  return timeout;
}

function generateModule (id, integration) {
  var friendlyName, modulePath, name, parts, ref, ref1, ref2, ref3, ref4, ref5, requestVariables, responseVariables, type;
  parts = id.split(/\./);
  name = parts.shift();
  modulePath = parts.join('.');
  friendlyName = integration.name || generateName(modulePath);
  type = modulePath.match(/inbound/) ? 'inbound' : modulePath.match(/outbound/) ? 'outbound' : void 0;
  requestVariables = (ref = (ref1 = integration != null ? typeof integration.requestVariables === 'function' ? integration.requestVariables() : void 0 : void 0) != null ? ref1 : (ref2 = integration.request) != null ? typeof ref2.variables === 'function' ? ref2.variables() : void 0 : void 0) != null ? ref : [];
  responseVariables = (ref3 = (ref4 = integration != null ? typeof integration.responseVariables === 'function' ? integration.responseVariables() : void 0 : void 0) != null ? ref4 : (ref5 = integration.response) != null ? typeof ref5.variables === 'function' ? ref5.variables() : void 0 : void 0) != null ? ref3 : [];
  if (type === 'outbound' && !_.find(requestVariables, {
    name: 'timeout_seconds'
  })) {
    requestVariables.push({
      name: 'timeout_seconds',
      type: 'number',
      description: 'Produce an "error" outcome if the server fails to respond within this number of seconds (default: 360)',
      required: false
    });
  }
  modules[id] = {
    id: id,
    type: type,
    'package': packages[name],
    path: modulePath,
    name: friendlyName,
    request_variables: requestVariables,
    response_variables: responseVariables
  };
  return modules[id];
}

function generateHandle (outbound) {
  if (!(typeof (outbound != null ? outbound.request : void 0) === 'function' && typeof (outbound != null ? outbound.response : void 0) === 'function')) {
    return;
  }
  return outbound.handle != null ? outbound.handle : outbound.handle = function (vars, callback) {
    var err, makeRequest, outboundReq;
    try {
      outboundReq = outbound.request(vars);
    } catch (error) {
      err = error;
      return callback(err);
    }
    if (outboundReq.headers != null) {
      outboundReq.headers['Content-Length'] = void 0;
    }
    makeRequest = function (options, cb) {
      var ref, ref1, ref2, ref3;
      options.url = (ref = options.url) != null ? ref.valueOf() : void 0;
      if (!((ref1 = options.url) != null ? ref1.trim() : void 0)) {
        return cb(new Error('request missing URL'));
      }
      if (!((ref2 = options.method) != null ? ref2.trim() : void 0)) {
        return cb(new Error('request missing method'));
      }
      options.timeout = ensureTimeout((ref3 = options.timeout) != null ? ref3 : vars.timeout_seconds) * 1000;
      try {
        return request(options, cb);
      } catch (error) {
        err = error;
        return cb(err);
      }
    };
    return makeRequest(outboundReq, function (err, outboundRes, body) {
      var event, ref, response;
      if (err != null) {
        return callback(err);
      }
      response = {
        status: outboundRes.statusCode,
        version: (ref = outboundRes.httpVersion) != null ? ref : '1.1',
        headers: normalizeHeaders(outboundRes.headers),
        body: body
      };
      try {
        event = outbound.response(vars, outboundReq, response);
      } catch (error) {
        err = error;
        return callback(err);
      }
      return callback(null, event);
    });
  };
}

function generateTypes (id, integration) {
  var module;
  module = modules[id];
  if (integration.requestTypes == null) {
    integration.requestTypes = getRequestTypes(module);
  }
  return integration.responseTypes != null ? integration.responseTypes : integration.responseTypes = getResponseTypes(module);
}

function getRequestTypes (module) {
  return getTypes(module.request_variables);
}

function getResponseTypes (module) {
  return getTypes(module.response_variables);
}

function getTypes (variables) {
  var mapType;
  mapType = function (types, v) {
    var ref;
    types[v.name] = (ref = v.type) != null ? ref : getDefaultType(v.name);
    return types;
  };
  return (variables != null ? variables : []).reduce(mapType, {});
}

function getDefaultType (varName) {
  var ref;
  return (ref = fields.getType(varName)) != null ? ref : 'string';
}

function generateAppendPrefix (id, integration) {
  var outcomeRegex, outcomeVar;
  outcomeRegex = /\.?outcome$/;
  outcomeVar = _.find(modules[id].response_variables, function (v) {
    var ref;
    return (ref = v.name) != null ? ref.match(outcomeRegex) : void 0;
  });
  if ((outcomeVar != null ? outcomeVar.name : void 0) != null) {
    return integration.appendPrefix = outcomeVar.name.replace(outcomeRegex, '');
  }
}

function normalizeHeaders (headers) {
  var field, normalField, normalHeaders, normalizePart, value;
  normalHeaders = {};
  for (field in headers) {
    value = headers[field];
    normalizePart = function (part) {
      return '' + (part[0].toUpperCase()) + (part.slice(1).toLowerCase());
    };
    normalField = field.split('-').map(normalizePart).join('-');
    normalHeaders[normalField] = value;
  }
  return normalHeaders;
}

function generateName (modulePath) {
  var name;
  name = modulePath.replace(/(inbound|outbound)\./, '').replace(/_/g, ' ').split(/\s|\./).map(function (part) {
    return string.capitalize(part);
  });
  return name.join(' ');
}

function findPaths (api, modulePath) {
  var apiProperties, key, mod, paths;
  if (modulePath == null) {
    modulePath = '';
  }
  paths = [];
  apiProperties = Object.keys(api);
  if (apiProperties.indexOf('request') !== -1 || apiProperties.indexOf('handle') !== -1) {
    paths.push(modulePath);
  } else {
    for (key in api) {
      mod = api[key];
      if (key === 'name') {
        continue;
      }
      paths = paths.concat(findPaths(mod, [modulePath, key].filter(empty).join('.')));
    }
  }
  return paths;
}

function empty (str) {
  return !!(str != null ? str.trim() : void 0);
}

module.exports = {
  create
};
