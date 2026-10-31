/* Khun Mhee – lightweight page runtime.
 * Renders the <template id="view"> markup with values from the page's Component class,
 * supporting {{holes}}, loops (data-sc="for"), conditions (data-sc="if") and on* events.
 * Re-renders on setState and patches the DOM with morphdom so inputs keep focus. */
(function () {
  'use strict';

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  var BOOL_ATTRS = { disabled: 1, checked: 1, selected: 1, hidden: 1, readonly: 1, required: 1, multiple: 1 };

  function resolve(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var q = expr.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var parts = expr.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) {
      var v = resolve(e, scope);
      return v == null ? '' : String(v);
    });
  }

  function child(scope, extra) {
    var s = Object.create(scope);
    for (var k in extra) s[k] = extra[k];
    return s;
  }

  function renderChildren(parentNode, out, scope) {
    var kids = parentNode.childNodes;
    for (var i = 0; i < kids.length; i++) renderNode(kids[i], out, scope);
  }

  function renderNode(node, out, scope) {
    if (node.nodeType === 3) {
      out.appendChild(document.createTextNode(interp(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;

    if (node.localName === 'template' && node.hasAttribute('data-sc')) {
      var kind = node.getAttribute('data-sc');
      if (kind === 'if') {
        var m = (node.getAttribute('value') || '').match(WHOLE);
        var cond = m ? resolve(m[1], scope) : interp(node.getAttribute('value') || '', scope);
        if (cond) renderChildren(node.content, out, scope);
      } else if (kind === 'for') {
        var lm = (node.getAttribute('list') || '').match(WHOLE);
        var list = lm ? resolve(lm[1], scope) : null;
        var as = node.getAttribute('as') || 'item';
        if (list && list.length) {
          for (var j = 0; j < list.length; j++) {
            var ex = { $index: j };
            ex[as] = list[j];
            renderChildren(node.content, out, child(scope, ex));
          }
        }
      }
      return;
    }

    var el = document.createElementNS(node.namespaceURI, node.localName);
    var handlers = null;
    var deferredValue;
    var hasValue = false;
    var attrs = node.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name;
      var val = attrs[a].value;
      if (name.indexOf('hint-') === 0) continue;
      var whole = val.match(WHOLE);
      if (whole) {
        var raw = resolve(whole[1], scope);
        if (name.indexOf('on') === 0 && name.length > 2) {
          if (typeof raw === 'function') {
            handlers = handlers || {};
            handlers[name.slice(2)] = raw;
          }
          continue;
        }
        if (name === 'value') { deferredValue = raw; hasValue = true; continue; }
        if (BOOL_ATTRS[name]) { if (raw) el.setAttribute(name, ''); continue; }
        if (raw == null) continue;
        el.setAttribute(name, String(raw));
      } else {
        if (name.indexOf('on') === 0 && name.length > 2 && name.indexOf('-') === -1) continue;
        el.setAttribute(name, interp(val, scope));
      }
    }
    if (handlers) el.__h = handlers;

    var src = node.localName === 'template' ? node.content : node;
    renderChildren(src, el, scope);

    if (hasValue) {
      var v = deferredValue == null ? '' : String(deferredValue);
      if (el.localName === 'select') {
        for (var o = 0; o < el.options.length; o++) {
          if (el.options[o].value === v) el.options[o].setAttribute('selected', '');
          else el.options[o].removeAttribute('selected');
        }
        el.value = v;
      } else if (el.localName === 'textarea') {
        el.value = v;
        el.textContent = v;
      } else if (el.localName === 'input') {
        if (el.type !== 'file') { el.setAttribute('value', v); el.value = v; }
      } else {
        el.setAttribute('value', v);
      }
    }
    out.appendChild(el);
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (partial, cb) {
    if (typeof partial === 'function') partial = partial(this.state, this.props);
    this.state = Object.assign({}, this.state, partial || {});
    if (this.__schedule) this.__schedule(cb);
  };
  DCLogic.prototype.forceUpdate = function (cb) {
    if (this.__schedule) this.__schedule(cb);
  };
  window.DCLogic = DCLogic;

  window.DC = {
    mount: function (Component, props, opts) {
      var tpl = (opts && opts.tpl) || document.getElementById('view');
      var root = (opts && opts.root) || document.getElementById('app');
      var inst = new Component(props || {});
      var pending = false;
      var callbacks = [];

      function render() {
        var vals = inst.renderVals ? inst.renderVals() : {};
        var frag = document.createElement('div');
        renderChildren(tpl.content, frag, vals);
        if (root.firstChild && window.morphdom) {
          window.morphdom(root, frag, {
            childrenOnly: true,
            onBeforeElUpdated: function (fromEl, toEl) {
              fromEl.__h = toEl.__h;
              if (fromEl.localName === 'input' && fromEl.type === 'file') return false;
              return true;
            }
          });
        } else {
          root.innerHTML = '';
          while (frag.firstChild) root.appendChild(frag.firstChild);
        }
      }

      inst.__schedule = function (cb) {
        if (cb) callbacks.push(cb);
        if (pending) return;
        pending = true;
        Promise.resolve().then(function () {
          pending = false;
          render();
          var cbs = callbacks.splice(0);
          cbs.forEach(function (f) { f(); });
        });
      };

      ['click', 'input', 'change', 'submit'].forEach(function (type) {
        root.addEventListener(type, function (e) {
          var node = e.target;
          while (node && node !== root) {
            if (node.__h && node.__h[type]) {
              if (type === 'submit') e.preventDefault();
              node.__h[type](e);
              return;
            }
            node = node.parentNode;
          }
        });
      });

      render();
      if (inst.componentDidMount) inst.componentDidMount();
      return inst;
    }
  };
})();
