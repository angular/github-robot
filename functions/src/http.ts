import * as request from 'request';

export type HttpOptions = request.Options & {responseType: 'json' | 'response'};

export class HttpClient {
  get<T>(url, options?: HttpOptions): Promise<T|request.Response> {
    return new Promise((resolve, reject) => {
      request(url, {headers: {'Accept': 'application/json'}}, (error, response, body) => {
        if(error) {
          reject(error);
        } else {
          // TODO: double check this parse
          if(options && options.responseType === 'response') {
            resolve(response);
          } else {
            resolve(JSON.parse(body));
          }
        }
      });
    });
  }
  put<T>(url, body): Promise<T> {
    return new Promise((resolve, reject) => {
      request.put(url, {headers: {'Accept': 'application/json'}, body: JSON.stringify(body) }, (error, response, resBody) => {
        if(error) {
          reject(error);
        } else {
          resolve(JSON.parse(resBody));
        }
      });
    });
  }
}
