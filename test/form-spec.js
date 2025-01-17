const assert = require('chai').assert;
const integration = require('../lib/form-post');

describe('Wrap of custom integration', function() {

  it('wraps request', () => {
    assert.isFunction(integration.request);
    assert.isArray(integration.request.variables());

    const req = integration.request({ url: 'https://example.com' });
    assert.equal(req.url, 'https://example.com');
    assert.exists(req.method);
    assert.isObject(req.headers);
  });

  it('wraps validate', () => {
    assert.isFunction(integration.validate);
    assert.isNotEmpty(integration.validate({}))
  });

  it('wraps response', () => {
    assert.isFunction(integration.response);
    assert.isArray(integration.response.variables());
    assert.exists(integration.response({}, {}, { headers: [] }).outcome);
  });
});
