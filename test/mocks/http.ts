import { HttpClient, HttpOptions } from "../../functions/src/http";

export class MockHttpHost {
  private endpoints: {[url: string]: {
    hits: number;
    response: any;
  }} = {};
  registerEndpoint(url: string, response: any) {
    this.endpoints[url] = {
      response,
      hits: 0,
    };
  }

  getHits(url: string) {
    return this.endpoints[url].hits;
  }
  getPostData(url: string) {
    return this.endpoints[url].response;
  }

  httpClient(): HttpClient {
    return {
      get: (url: string, options: HttpOptions): Promise<string|any> => {
        this.endpoints[url].hits ++;
        return new Promise((resolve, reject) => resolve(this.endpoints[url].response as string));
      },
      put: (url: string, data: any): Promise<any> => {
        this.endpoints[url] = {
          hits: 1,
          response: data,
        };
        return Promise.resolve();
      }
    };
  }
}
