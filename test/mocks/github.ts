import {define, emitter, loadDefs, NockDefinition} from 'nock';

function get(name: string): NockDefinition[] {
  return loadDefs(`${__dirname}/scenarii/api.github.com/${name}.json`);
}

function objectToRawHeaders(map: any) {
  const keys = Object.keys(map).sort();
  return [].concat.apply([], keys.map(key => [key, map[key]]));
}

export function mockGithub(name: string) {
  const fixtures = get(name);
  fixtures.forEach(fixture => {
    fixture['rawHeaders'] = objectToRawHeaders(fixture.headers);
    delete fixture.headers;
  });
  define(fixtures);
}

emitter.on('no match', function(req, options, body) {
  console.log(options, body);
});
