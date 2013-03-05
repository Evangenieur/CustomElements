/*
 * Copyright 2013 The Toolkitchen Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

/**
Implements `document.register`
@module CustomElements
*/

/**
Polyfilled extensions for the `document` object.

@class Document
*/

(function() {

/**
 * Registers a custom tag name with the document.
 * 
 * @method register
 * @param {String} inName The tag name to register. Must include a dash ('-'), 
 *    for example 'x-component'.
 * @param {Object} inOptions
 *    @param {String} [inOptions.extends]
 *      (_off spec_) Tag name of an element to extend (or blank for a new 
 *      element). This paramter is not part of the specification, but instead 
 *      is a hint for the polyfill because the extendee is difficult to infer.
 *      Remember that the input prototype must chain to the extended element's 
 *      prototype (or HTMLElement.prototype) regardless of the value of 
 *      `extends`.
 *    @param {Object} inOptions.prototype The prototype to use for the new 
 *      element. The prototype must inherit from HTMLElement.
 *    @param {Object} [inOptions.lifecycle]
 *      Callbacks that fire at important phases in the life of the custom 
 *      element.
 *       
 * @example
 *      FancyButton = document.register("fancy-button", {
 *        extends: 'button',
 *        prototype: Object.create(HTMLButtonElement.prototype)
 *      });
 * @return {Function} Constructor for the newly registered type.
 */
function register(inName, inOptions) {
  //console.warn('document.register("' + inName + '", ', inOptions, ')');
  // construct a defintion out of options
  // TODO(sjmiles): probably should clone inOptions instead of mutating it
  var definition = inOptions || {};
  // record name
  definition.name = inName;
  // ensure a lifecycle object so we don't have to null test it
  definition.lifecycle = definition.lifecycle || {};
  // must have a prototype, default to an extension of HTMLElement
  // TODO(sjmiles): probably should throw if no prototype, check spec
  definition.prototype = definition.prototype
      || Object.create(HTMLUnknownElement.prototype);
  // build a list of ancestral custom elements (for lifecycle management)
  definition.ancestry = ancestry(definition.extends);
  // extensions of native specializations of HTMLElement require localName
  // to remain native, and use secondary 'is' specifier for extension type
  resolveTagName(definition);
  // 7.1.5: Register the DEFINITION with DOCUMENT
  registerDefinition(inName, definition);
  // 7.1.7. Run custom element constructor generation algorithm with PROTOTYPE
  // 7.1.8. Return the output of the previous step.
  definition.ctor = generateConstructor(definition);
  definition.ctor.prototype = definition.prototype;
  return definition.ctor;
}

function ancestry(inExtends) {
  var extendee = registry[inExtends];
  if (extendee) {
    return ancestry(extendee.extends).concat([extendee]);
  }
  return [];
}

function resolveTagName(inDefinition) {
  // if we are explicitly extending something, that thing is our
  // baseTag, unless it represents a custom compoenent
  var baseTag = inDefinition.extends;
  // if our ancestry includes custom components, we only have a
  // baseTag if one of them does
  for (var i=0, a; (a=inDefinition.ancestry[i]); i++) {
    baseTag = a.is && a.tag;
  }
  // our tag is our baseTag, if it exists, and otherwise just our name
  inDefinition.tag = baseTag || inDefinition.name;
  // if there is a base tag, use secondary 'is' specifier
  if (baseTag) {
    inDefinition.is = inDefinition.name;
  }
}

// SECTION 4

function instantiate(inDefinition) {
  // 4.a.1. Create a new object that implements PROTOTYPE
  // 4.a.2. Let ELEMENT by this new object
  //
  // the custom element instantiation algorithm must also ensure that the
  // output is a valid DOM element with the proper wrapper in place.
  //
  return upgrade(domCreateElement(inDefinition.tag), inDefinition);
}

function upgrade(inElement, inDefinition) {
  var element = inElement;
  // TODO(sjmiles): polyfill pollution
  // under ShadowDOM polyfill `inElement` may be a node wrapper,
  // we need the underlying node
  if (element.node && element.node.__$wrapper$__) {
    element = element.node;
    element.__$wrapper$__ = null;
  }
  // some definitions specify as 'is' attribute
  if (inDefinition.is) {
    inElement.setAttribute('is', inDefinition.is);
  }
  // TODO(sjmiles): polyfill pollution
  // under ShadowDOM polyfill `implementor` may be a node wrapper
  var implementor = implement(element, inDefinition.prototype);
  // invoke lifecycle.created callbacks
  created(implementor, inDefinition);
  // flag as upgraded
  implementor.__upgraded__ = true;
  // OUTPUT
  return implementor;
};

function implement(inElement, inPrototype) {
  if (Object.__proto__) {
    inElement.__proto__ = inPrototype;
  } else {
    // where above we can re-acquire inPrototype via
    // getPrototypeOf(Element), we cannot do so when
    // we use mixin, so we install a magic reference
    inElement.__proto__ = inPrototype;
    mixin(inElement, inPrototype);
  }
  // special handling for polyfill wrappers
  // TODO(sjmiles): polyfill pollution
  return _publishToWrapper(inElement, inPrototype);
}

// TODO(sjmiles): polyfill pollution
function _publishToWrapper(inElement, inPrototype) {
  var element = (window.wrap && wrap(inElement)) || inElement;
  if (window.Nohd) {
    // attempt to publish our public interface directly
    // to our ShadowDOM polyfill wrapper object (excluding overrides)
    var p = inPrototype;
    while (p && p !== HTMLElement.prototype) {
      Object.keys(p).forEach(function(k) {
        if (!(k in element)) {
          copyProperty(k, inPrototype, element);
        }
      });
      p = Object.getPrototypeOf(p);
    }
  }
  return element;
}

function created(inElement, inDefinition) {
  var readyCallback = inDefinition.lifecycle.readyCallback || 
      inElement.readyCallback;
  if (readyCallback) {
    readyCallback.call(inElement);
  }
}

var registry = {};
var registrySlctr = '';

function registerDefinition(inName, inDefinition) {
  registry[inName] = inDefinition;
  registrySlctr += (registrySlctr ? ',' : '');
  if (inDefinition.extends) {
    registrySlctr += inDefinition.extends + '[is=' + inDefinition.is + '],';
  }
  registrySlctr += inName;
}

function generateConstructor(inDefinition) {
  return function() {
    return instantiate(inDefinition);
  };
}

function createElement(inTag) {
  var definition = registry[inTag];
  if (definition) {
    return new definition.ctor();
  }
  return domCreateElement(inTag);
}

function upgradeElement(inElement) {
  if (inElement.__upgraded__) {
    return;
  }
  // TODO(sjmiles): polyfill pollution
  var element = inElement.node || inElement;
  var definition =
      registry[element.getAttribute('is') || element.localName];
  return upgrade(element, definition);
}

function upgradeElements(inRoot) {
  if (registrySlctr) {
    var nodes = inRoot.querySelectorAll(registrySlctr);
    forEach(nodes, upgradeElement);
  }
}

// utilities

// copy all properties from inProps (et al) to inObj
function mixin(inObj/*, inProps, inMoreProps, ...*/) {
  var obj = inObj || {};
  for (var i = 1; i < arguments.length; i++) {
    var p = arguments[i];
    // TODO(sjmiles): on IE we are using mixin
    // to generate custom element instances, as we have
    // no way to alter element prototypes after creation
    // (nor a way to create an element with a custom prototype)
    // however, prototype sources (inSource) are ultimately
    // chained to a native prototype (HTMLElement or inheritor)
    // and trying to copy HTMLElement properties to itself throwss
    // in IE
    // we don't actually want to copy those properties anyway, but I
    // can't find a way to determine if a prototype is a native
    // or custom inheritor of HTMLElement
    // ad hoc solution is to simply stop at the first exception
    // an alternative exists if we have a tagName hint: then we can
    // work out where the native objects are in the prototype chain
    try {
      for (var n in p) {
        copyProperty(n, p, obj);
      }
    } catch(x) {
      //console.log(x);
    }
  }
  return obj;
}

// copy property inName from inSource object to inTarget object
function copyProperty(inName, inSource, inTarget) {
  var pd = getPropertyDescriptor(inSource, inName);
  Object.defineProperty(inTarget, inName, pd);
}

// get property descriptor for inName on inObject, even if
// inName exists on some link in inObject's prototype chain
function getPropertyDescriptor(inObject, inName) {
  if (inObject) {
    var pd = Object.getOwnPropertyDescriptor(inObject, inName);
    return pd || getPropertyDescriptor(Object.getPrototypeOf(inObject), inName);
  }
}

// capture native createElement before we override it
var domCreateElement = document.createElement.bind(document);

// exports

document.register = register;
document.upgradeElement = upgradeElement;
document.upgradeElements = upgradeElements;
document.createElement = createElement; // override

// TODO(sjmiles): temporary, control scope better
window.mixin = mixin;

// bootstrap

window.addEventListener('load', function() {
  componentDocument.parse(document, function() {
     document.upgradeElements(document.body);
   });
});

})();
