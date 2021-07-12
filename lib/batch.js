"use strict";

const Parse = require('parse/node').Parse;

const url = require('url');

const path = require('path'); // These methods handle batch requests.


const batchPath = '/batch'; // Mounts a batch-handler onto a PromiseRouter.

function mountOnto(router) {
  router.route('POST', batchPath, req => {
    return handleBatch(router, req);
  });
}

function parseURL(URL) {
  if (typeof URL === 'string') {
    return url.parse(URL);
  }

  return undefined;
}

function makeBatchRoutingPathFunction(originalUrl, serverURL, publicServerURL) {
  serverURL = serverURL ? parseURL(serverURL) : undefined;
  publicServerURL = publicServerURL ? parseURL(publicServerURL) : undefined;
  const apiPrefixLength = originalUrl.length - batchPath.length;
  let apiPrefix = originalUrl.slice(0, apiPrefixLength);

  const makeRoutablePath = function (requestPath) {
    // The routablePath is the path minus the api prefix
    if (requestPath.slice(0, apiPrefix.length) != apiPrefix) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'cannot route batch path ' + requestPath);
    }

    return path.posix.join('/', requestPath.slice(apiPrefix.length));
  };

  if (serverURL && publicServerURL && serverURL.path != publicServerURL.path) {
    const localPath = serverURL.path;
    const publicPath = publicServerURL.path; // Override the api prefix

    apiPrefix = localPath;
    return function (requestPath) {
      // Figure out which server url was used by figuring out which
      // path more closely matches requestPath
      const startsWithLocal = requestPath.startsWith(localPath);
      const startsWithPublic = requestPath.startsWith(publicPath);
      const pathLengthToUse = startsWithLocal && startsWithPublic ? Math.max(localPath.length, publicPath.length) : startsWithLocal ? localPath.length : publicPath.length;
      const newPath = path.posix.join('/', localPath, '/', requestPath.slice(pathLengthToUse)); // Use the method for local routing

      return makeRoutablePath(newPath);
    };
  }

  return makeRoutablePath;
} // Returns a promise for a {response} object.
// TODO: pass along auth correctly


function handleBatch(router, req) {
  if (!Array.isArray(req.body.requests)) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'requests must be an array');
  } // The batch paths are all from the root of our domain.
  // That means they include the API prefix, that the API is mounted
  // to. However, our promise router does not route the api prefix. So
  // we need to figure out the API prefix, so that we can strip it
  // from all the subrequests.


  if (!req.originalUrl.endsWith(batchPath)) {
    throw 'internal routing problem - expected url to end with batch';
  }

  const makeRoutablePath = makeBatchRoutingPathFunction(req.originalUrl, req.config.serverURL, req.config.publicServerURL);

  const batch = transactionRetries => {
    let initialPromise = Promise.resolve();

    if (req.body.transaction === true) {
      initialPromise = req.config.database.createTransactionalSession();
    }

    return initialPromise.then(() => {
      const promises = req.body.requests.map(restRequest => {
        const routablePath = makeRoutablePath(restRequest.path); // Construct a request that we can send to a handler

        const request = {
          body: restRequest.body,
          config: req.config,
          auth: req.auth,
          info: req.info
        };
        return router.tryRouteRequest(restRequest.method, routablePath, request).then(response => {
          return {
            success: response.response
          };
        }, error => {
          return {
            error: {
              code: error.code,
              error: error.message
            }
          };
        });
      });
      return Promise.all(promises).then(results => {
        if (req.body.transaction === true) {
          if (results.find(result => typeof result.error === 'object')) {
            return req.config.database.abortTransactionalSession().then(() => {
              return Promise.reject({
                response: results
              });
            });
          } else {
            return req.config.database.commitTransactionalSession().then(() => {
              return {
                response: results
              };
            });
          }
        } else {
          return {
            response: results
          };
        }
      }).catch(error => {
        if (error && error.response && error.response.find(errorItem => typeof errorItem.error === 'object' && errorItem.error.code === 251) && transactionRetries > 0) {
          return batch(transactionRetries - 1);
        }

        throw error;
      });
    });
  };

  return batch(5);
}

module.exports = {
  mountOnto,
  makeBatchRoutingPathFunction
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9iYXRjaC5qcyJdLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJ1cmwiLCJwYXRoIiwiYmF0Y2hQYXRoIiwibW91bnRPbnRvIiwicm91dGVyIiwicm91dGUiLCJyZXEiLCJoYW5kbGVCYXRjaCIsInBhcnNlVVJMIiwiVVJMIiwicGFyc2UiLCJ1bmRlZmluZWQiLCJtYWtlQmF0Y2hSb3V0aW5nUGF0aEZ1bmN0aW9uIiwib3JpZ2luYWxVcmwiLCJzZXJ2ZXJVUkwiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJhcGlQcmVmaXhMZW5ndGgiLCJsZW5ndGgiLCJhcGlQcmVmaXgiLCJzbGljZSIsIm1ha2VSb3V0YWJsZVBhdGgiLCJyZXF1ZXN0UGF0aCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwicG9zaXgiLCJqb2luIiwibG9jYWxQYXRoIiwicHVibGljUGF0aCIsInN0YXJ0c1dpdGhMb2NhbCIsInN0YXJ0c1dpdGgiLCJzdGFydHNXaXRoUHVibGljIiwicGF0aExlbmd0aFRvVXNlIiwiTWF0aCIsIm1heCIsIm5ld1BhdGgiLCJBcnJheSIsImlzQXJyYXkiLCJib2R5IiwicmVxdWVzdHMiLCJlbmRzV2l0aCIsImNvbmZpZyIsImJhdGNoIiwidHJhbnNhY3Rpb25SZXRyaWVzIiwiaW5pdGlhbFByb21pc2UiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRyYW5zYWN0aW9uIiwiZGF0YWJhc2UiLCJjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInRoZW4iLCJwcm9taXNlcyIsIm1hcCIsInJlc3RSZXF1ZXN0Iiwicm91dGFibGVQYXRoIiwicmVxdWVzdCIsImF1dGgiLCJpbmZvIiwidHJ5Um91dGVSZXF1ZXN0IiwibWV0aG9kIiwicmVzcG9uc2UiLCJzdWNjZXNzIiwiZXJyb3IiLCJjb2RlIiwibWVzc2FnZSIsImFsbCIsInJlc3VsdHMiLCJmaW5kIiwicmVzdWx0IiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsInJlamVjdCIsImNvbW1pdFRyYW5zYWN0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ZnZFLEVBQUFBLFNBRGU7QUFFZlMsRUFBQUE7QUFGZSxDQUFqQiIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuY29uc3QgdXJsID0gcmVxdWlyZSgndXJsJyk7XG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgYmF0Y2ggcmVxdWVzdHMuXG5jb25zdCBiYXRjaFBhdGggPSAnL2JhdGNoJztcblxuLy8gTW91bnRzIGEgYmF0Y2gtaGFuZGxlciBvbnRvIGEgUHJvbWlzZVJvdXRlci5cbmZ1bmN0aW9uIG1vdW50T250byhyb3V0ZXIpIHtcbiAgcm91dGVyLnJvdXRlKCdQT1NUJywgYmF0Y2hQYXRoLCByZXEgPT4ge1xuICAgIHJldHVybiBoYW5kbGVCYXRjaChyb3V0ZXIsIHJlcSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZVVSTChVUkwpIHtcbiAgaWYgKHR5cGVvZiBVUkwgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHVybC5wYXJzZShVUkwpO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG1ha2VCYXRjaFJvdXRpbmdQYXRoRnVuY3Rpb24ob3JpZ2luYWxVcmwsIHNlcnZlclVSTCwgcHVibGljU2VydmVyVVJMKSB7XG4gIHNlcnZlclVSTCA9IHNlcnZlclVSTCA/IHBhcnNlVVJMKHNlcnZlclVSTCkgOiB1bmRlZmluZWQ7XG4gIHB1YmxpY1NlcnZlclVSTCA9IHB1YmxpY1NlcnZlclVSTCA/IHBhcnNlVVJMKHB1YmxpY1NlcnZlclVSTCkgOiB1bmRlZmluZWQ7XG5cbiAgY29uc3QgYXBpUHJlZml4TGVuZ3RoID0gb3JpZ2luYWxVcmwubGVuZ3RoIC0gYmF0Y2hQYXRoLmxlbmd0aDtcbiAgbGV0IGFwaVByZWZpeCA9IG9yaWdpbmFsVXJsLnNsaWNlKDAsIGFwaVByZWZpeExlbmd0aCk7XG5cbiAgY29uc3QgbWFrZVJvdXRhYmxlUGF0aCA9IGZ1bmN0aW9uIChyZXF1ZXN0UGF0aCkge1xuICAgIC8vIFRoZSByb3V0YWJsZVBhdGggaXMgdGhlIHBhdGggbWludXMgdGhlIGFwaSBwcmVmaXhcbiAgICBpZiAocmVxdWVzdFBhdGguc2xpY2UoMCwgYXBpUHJlZml4Lmxlbmd0aCkgIT0gYXBpUHJlZml4KSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnY2Fubm90IHJvdXRlIGJhdGNoIHBhdGggJyArIHJlcXVlc3RQYXRoKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGgucG9zaXguam9pbignLycsIHJlcXVlc3RQYXRoLnNsaWNlKGFwaVByZWZpeC5sZW5ndGgpKTtcbiAgfTtcblxuICBpZiAoc2VydmVyVVJMICYmIHB1YmxpY1NlcnZlclVSTCAmJiBzZXJ2ZXJVUkwucGF0aCAhPSBwdWJsaWNTZXJ2ZXJVUkwucGF0aCkge1xuICAgIGNvbnN0IGxvY2FsUGF0aCA9IHNlcnZlclVSTC5wYXRoO1xuICAgIGNvbnN0IHB1YmxpY1BhdGggPSBwdWJsaWNTZXJ2ZXJVUkwucGF0aDtcblxuICAgIC8vIE92ZXJyaWRlIHRoZSBhcGkgcHJlZml4XG4gICAgYXBpUHJlZml4ID0gbG9jYWxQYXRoO1xuICAgIHJldHVybiBmdW5jdGlvbiAocmVxdWVzdFBhdGgpIHtcbiAgICAgIC8vIEZpZ3VyZSBvdXQgd2hpY2ggc2VydmVyIHVybCB3YXMgdXNlZCBieSBmaWd1cmluZyBvdXQgd2hpY2hcbiAgICAgIC8vIHBhdGggbW9yZSBjbG9zZWx5IG1hdGNoZXMgcmVxdWVzdFBhdGhcbiAgICAgIGNvbnN0IHN0YXJ0c1dpdGhMb2NhbCA9IHJlcXVlc3RQYXRoLnN0YXJ0c1dpdGgobG9jYWxQYXRoKTtcbiAgICAgIGNvbnN0IHN0YXJ0c1dpdGhQdWJsaWMgPSByZXF1ZXN0UGF0aC5zdGFydHNXaXRoKHB1YmxpY1BhdGgpO1xuICAgICAgY29uc3QgcGF0aExlbmd0aFRvVXNlID1cbiAgICAgICAgc3RhcnRzV2l0aExvY2FsICYmIHN0YXJ0c1dpdGhQdWJsaWNcbiAgICAgICAgICA/IE1hdGgubWF4KGxvY2FsUGF0aC5sZW5ndGgsIHB1YmxpY1BhdGgubGVuZ3RoKVxuICAgICAgICAgIDogc3RhcnRzV2l0aExvY2FsXG4gICAgICAgICAgICA/IGxvY2FsUGF0aC5sZW5ndGhcbiAgICAgICAgICAgIDogcHVibGljUGF0aC5sZW5ndGg7XG5cbiAgICAgIGNvbnN0IG5ld1BhdGggPSBwYXRoLnBvc2l4LmpvaW4oJy8nLCBsb2NhbFBhdGgsICcvJywgcmVxdWVzdFBhdGguc2xpY2UocGF0aExlbmd0aFRvVXNlKSk7XG5cbiAgICAgIC8vIFVzZSB0aGUgbWV0aG9kIGZvciBsb2NhbCByb3V0aW5nXG4gICAgICByZXR1cm4gbWFrZVJvdXRhYmxlUGF0aChuZXdQYXRoKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIG1ha2VSb3V0YWJsZVBhdGg7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZX0gb2JqZWN0LlxuLy8gVE9ETzogcGFzcyBhbG9uZyBhdXRoIGNvcnJlY3RseVxuZnVuY3Rpb24gaGFuZGxlQmF0Y2gocm91dGVyLCByZXEpIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KHJlcS5ib2R5LnJlcXVlc3RzKSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdyZXF1ZXN0cyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gIH1cblxuICAvLyBUaGUgYmF0Y2ggcGF0aHMgYXJlIGFsbCBmcm9tIHRoZSByb290IG9mIG91ciBkb21haW4uXG4gIC8vIFRoYXQgbWVhbnMgdGhleSBpbmNsdWRlIHRoZSBBUEkgcHJlZml4LCB0aGF0IHRoZSBBUEkgaXMgbW91bnRlZFxuICAvLyB0by4gSG93ZXZlciwgb3VyIHByb21pc2Ugcm91dGVyIGRvZXMgbm90IHJvdXRlIHRoZSBhcGkgcHJlZml4LiBTb1xuICAvLyB3ZSBuZWVkIHRvIGZpZ3VyZSBvdXQgdGhlIEFQSSBwcmVmaXgsIHNvIHRoYXQgd2UgY2FuIHN0cmlwIGl0XG4gIC8vIGZyb20gYWxsIHRoZSBzdWJyZXF1ZXN0cy5cbiAgaWYgKCFyZXEub3JpZ2luYWxVcmwuZW5kc1dpdGgoYmF0Y2hQYXRoKSkge1xuICAgIHRocm93ICdpbnRlcm5hbCByb3V0aW5nIHByb2JsZW0gLSBleHBlY3RlZCB1cmwgdG8gZW5kIHdpdGggYmF0Y2gnO1xuICB9XG5cbiAgY29uc3QgbWFrZVJvdXRhYmxlUGF0aCA9IG1ha2VCYXRjaFJvdXRpbmdQYXRoRnVuY3Rpb24oXG4gICAgcmVxLm9yaWdpbmFsVXJsLFxuICAgIHJlcS5jb25maWcuc2VydmVyVVJMLFxuICAgIHJlcS5jb25maWcucHVibGljU2VydmVyVVJMXG4gICk7XG5cbiAgY29uc3QgYmF0Y2ggPSB0cmFuc2FjdGlvblJldHJpZXMgPT4ge1xuICAgIGxldCBpbml0aWFsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChyZXEuYm9keS50cmFuc2FjdGlvbiA9PT0gdHJ1ZSkge1xuICAgICAgaW5pdGlhbFByb21pc2UgPSByZXEuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGluaXRpYWxQcm9taXNlLnRoZW4oKCkgPT4ge1xuICAgICAgY29uc3QgcHJvbWlzZXMgPSByZXEuYm9keS5yZXF1ZXN0cy5tYXAocmVzdFJlcXVlc3QgPT4ge1xuICAgICAgICBjb25zdCByb3V0YWJsZVBhdGggPSBtYWtlUm91dGFibGVQYXRoKHJlc3RSZXF1ZXN0LnBhdGgpO1xuXG4gICAgICAgIC8vIENvbnN0cnVjdCBhIHJlcXVlc3QgdGhhdCB3ZSBjYW4gc2VuZCB0byBhIGhhbmRsZXJcbiAgICAgICAgY29uc3QgcmVxdWVzdCA9IHtcbiAgICAgICAgICBib2R5OiByZXN0UmVxdWVzdC5ib2R5LFxuICAgICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgICBhdXRoOiByZXEuYXV0aCxcbiAgICAgICAgICBpbmZvOiByZXEuaW5mbyxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gcm91dGVyLnRyeVJvdXRlUmVxdWVzdChyZXN0UmVxdWVzdC5tZXRob2QsIHJvdXRhYmxlUGF0aCwgcmVxdWVzdCkudGhlbihcbiAgICAgICAgICByZXNwb25zZSA9PiB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiByZXNwb25zZS5yZXNwb25zZSB9O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZXJyb3IgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfSB9O1xuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXEuYm9keS50cmFuc2FjdGlvbiA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMuZmluZChyZXN1bHQgPT4gdHlwZW9mIHJlc3VsdC5lcnJvciA9PT0gJ29iamVjdCcpKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24oKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoeyByZXNwb25zZTogcmVzdWx0cyB9KTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZS5jb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiByZXN1bHRzIH07XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogcmVzdWx0cyB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBlcnJvciAmJlxuICAgICAgICAgICAgZXJyb3IucmVzcG9uc2UgJiZcbiAgICAgICAgICAgIGVycm9yLnJlc3BvbnNlLmZpbmQoXG4gICAgICAgICAgICAgIGVycm9ySXRlbSA9PiB0eXBlb2YgZXJyb3JJdGVtLmVycm9yID09PSAnb2JqZWN0JyAmJiBlcnJvckl0ZW0uZXJyb3IuY29kZSA9PT0gMjUxXG4gICAgICAgICAgICApICYmXG4gICAgICAgICAgICB0cmFuc2FjdGlvblJldHJpZXMgPiAwXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICByZXR1cm4gYmF0Y2godHJhbnNhY3Rpb25SZXRyaWVzIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfTtcbiAgcmV0dXJuIGJhdGNoKDUpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbW91bnRPbnRvLFxuICBtYWtlQmF0Y2hSb3V0aW5nUGF0aEZ1bmN0aW9uLFxufTtcbiJdfQ==