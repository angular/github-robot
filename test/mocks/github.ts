import {define, emitter, loadDefs, NockDefinition} from 'nock';
const nock = require('nock');

function get(name: string): NockDefinition[] {
  return loadDefs(`${__dirname}/scenarii/api.github.com/${name}.json`);
}

function objectToRawHeaders(map: any) {
  const keys = Object.keys(map).sort();
  return [].concat.apply([], keys.map(key => [key, map[key]]));
}

export function mockGithub(name: string) {
  const fixtures = get(name);
  fixtures.forEach((fixture: any) => {
    fixture['rawHeaders'] = objectToRawHeaders(fixture.headers);
    delete fixture.headers;
  });
  define(fixtures);
}

export function mockGraphQL(response: {[key: string]: any}) {
  nock('https://api.github.com:443', {"encodedQueryParams": true})
    .post('/graphql')
    .reply(200, {
      "data": response
    });
}

emitter.on('no match', function(req, options, body) {
  console.log(options, body);
});
