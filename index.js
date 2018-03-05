function serialize(obj) {
  const str = [];
  Object.keys(obj).filter(key => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      str.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
    }
    return key;
  });
  return str.join("&");
}

function goTo(action, store, next, payload, meta) {
  if (typeof action !== "function") {
    /* eslint-disable no-console */
    console.error(
      "fetchMiddleware require a function for onStart, onSuccess, onFailure"
    );
    /* eslint-enable no-console */
    return;
  }

  const res = action(payload, meta, store.dispatch, store.getState);
  if (res) {
    next(res);
  }
}

let config = {
  base: "",
  onRequest: null,
  defaultParams: null
};

function sendError(action, store, next, result, status, headers) {
  if (action.onError) {
    goTo(action.onError, store, next, result, { httpCode: status, headers });
  }

  if (action.autoDispatchPrefix) {
    next({ type: `${action.autoDispatchPrefix}_ERROR`, error: result });
  }
}

const fetchMiddleware = store => next => action => {
  if (!action.url) {
    return next(action);
  }
  let request = {
    url: action.url,
    method: action.method || "GET",
    headers: action.headers,
    body: action.body,
    mode: action.mode || "cors"
  };

  if (config.defaultParams || action.params) {
    request.params = { ...config.defaultParams, ...(action.params || {}) };
  }

  if (config.onRequest) {
    request = {
      ...request,
      ...config.onRequest(request, store.getState(), action)
    };
  }

  if (action.onStart) {
    goTo(action.onStart, store, next);
  }

  if (action.autoDispatchPrefix) {
    next({ type: `${action.autoDispatchPrefix}_REQUEST` });
  }

  const baseUrl = typeof action.base === "string" ? action.base : config.base;
  const params = request.params ? `?${serialize(request.params)}` : "";
  const { headers, body, method, mode } = request;
  fetch(`${baseUrl}${request.url}${params}`, {
    method,
    headers,
    body: body instanceof FormData ? body : JSON.stringify(body),
    mode
  })
    .then(response => {
      return response
        .json()
        .then(result => {
          return {
            status: response.status,
            ok: response.ok,
            body: result,
            headers: response.headers
          };
        })
        .catch(() => {
          return { status: response.status, ok: response.ok, body: {} };
        });
    })
    .then(
      response => {
        if (response.ok) {
          if (action.onSuccess) {
            goTo(action.onSuccess, store, next, response.body, {
              headers: response.headers
            });
          }
          if (action.autoDispatchPrefix) {
            next({
              type: `${action.autoDispatchPrefix}_SUCCESS`,
              payload: response.body
            });
          }
        } else {
          const result = response.body;
          if (!response.body.error) {
            result.error = "UnknownError";
          }
          sendError(
            action,
            store,
            next,
            result,
            response.status,
            response.headers
          );
        }
      },
      response => {
        sendError(
          action,
          store,
          next,
          response.body,
          response.status,
          response.headers
        );
      }
    );
  return null;
};

export default function(customConfig) {
  config = { ...config, ...customConfig };
  return fetchMiddleware;
}
