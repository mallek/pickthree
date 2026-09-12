/* PickThree shim: the page globals and jQuery subset PvPoke's GameMaster.js expects.
   The real game master JSON is injected by the host as __PICKTHREE_GAMEMASTER__ before this runs. */
var host = 'localhost';
var webRoot = '/';
var siteVersion = 'pickthree';
var settings = {
  defaultIVs: 'gamemaster',
  animateTimeline: 0,
  matrixDirection: 'row',
  gamemaster: 'gamemaster',
  pokeboxId: 0,
  pokeboxLastDateTime: 0,
  xls: true,
  rankingDetails: 'one-page',
  hardMovesetLinks: 0,
  colorblindMode: 0,
  performanceMode: 0,
  theme: 'default',
};
var InterfaceMaster = {
  getInstance: function () {
    return { init: function () {} };
  },
  getInterface: function () {
    return {};
  },
};
function __noopChain() {
  var chain = {};
  var methods = [
    'insertAfter',
    'eq',
    'append',
    'appendTo',
    'find',
    'html',
    'text',
    'attr',
    'addClass',
    'removeClass',
    'show',
    'hide',
    'on',
    'off',
    'val',
    'each',
    'first',
    'last',
    'remove',
    'empty',
    'css',
    'prop',
    'toggleClass',
    'trigger',
  ];
  for (var i = 0; i < methods.length; i++) {
    chain[methods[i]] = function () {
      return chain;
    };
  }
  chain.length = 0;
  return chain;
}
var $ = function () {
  return __noopChain();
};
$.each = function (collection, fn) {
  if (Array.isArray(collection)) {
    for (var i = 0; i < collection.length; i++) {
      if (fn.call(collection[i], i, collection[i]) === false) {
        break;
      }
    }
  } else if (collection) {
    var keys = Object.keys(collection);
    for (var k = 0; k < keys.length; k++) {
      if (fn.call(collection[keys[k]], keys[k], collection[keys[k]]) === false) {
        break;
      }
    }
  }
  return collection;
};
/* Real jQuery ajax is asynchronous: GameMaster finishes defining its methods before the success
   callback runs. Queue the callback here and let the host flush it after getInstance() returns. */
var __pickthreePendingAjax = [];
$.ajax = function (opts) {
  if (opts && typeof opts.success === 'function') {
    __pickthreePendingAjax.push(function () {
      opts.success(__PICKTHREE_GAMEMASTER__);
    });
  }
};
function __pickthreeFlushAjax() {
  var pending = __pickthreePendingAjax;
  __pickthreePendingAjax = [];
  for (var i = 0; i < pending.length; i++) {
    pending[i]();
  }
}
$.getJSON = function (url, cb) {
  if (typeof cb === 'function') {
    cb([]);
  }
};
