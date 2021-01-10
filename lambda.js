
// Lambda Adapter for leadconduit-form-post
// Generated on Thu Jan 07 2021 13:51:06 GMT-0500 (Eastern Standard Time)

const runner = require('.rip/runner');
const handle = require('.rip/handle');

function form_post( event, context, callback ) {
    const integration = handle.create('form_post');
    return runner( integration, event, context, callback );
}

let lambda = {};
lambda.form_post = form_post;

module.exports = lambda;
