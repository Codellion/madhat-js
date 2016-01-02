/// <reference path="ObservableArray.ts" />
/// <reference path="ModelProperty.ts" />
/// <reference path="DynamicCode.ts" />
var BindableProperty = (function () {
    function BindableProperty(propertyName, hashEventName, value, parentValue, isIndependent) {
        this.dirty = false;
        this.name = propertyName;
        this._tempValue = null;
        this._parentValue = parentValue;
        this._externalReference = null;
        this.hashEventName = hashEventName;
        this.propertyChange = new CustomEvent(this.propertyChangeEvent, { detail: this });
        if (Array.isArray(value) || value instanceof ObservableArray) {
            if (Array.isArray(value)) {
                var obsArr = null;
                if (!isIndependent)
                    obsArr = new ObservableArray(propertyName);
                else
                    obsArr = new ObservableArray(propertyName, this);
                obsArr.initialize(value);
                this.value = obsArr;
            }
            else
                this.value = value;
            this.dirty = true;
        }
        else {
            this.value = value;
        }
    }
    Object.defineProperty(BindableProperty.prototype, "dispatchEvents", {
        get: function () {
            if (!window["dt-dispatchEvents"])
                window["dt-dispatchEvents"] = [];
            return window["dt-dispatchEvents"];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BindableProperty.prototype, "value", {
        get: function () {
            if (this._parseInProgress)
                return null;
            if ((this.name.indexOf('#') == 0 || this.name.indexOf('@') == 0) && this.dirty == true) {
                var func = this.name.slice(1);
                var result = null;
                if (func.indexOf("=>") != -1)
                    func = DynamicCode.parseLambdaExpression(func);
                if (this.name.indexOf('@') == 0) {
                    this._eventExpresion = func;
                    var _this = this;
                    result = (function () {
                        window["dt-dispatchEvents"] = [];
                        return DynamicCode.evalInContext(_this._eventExpresion, _this._parentValue);
                    });
                }
                else {
                    result = DynamicCode.evalInContext(func, this._parentValue);
                }
                this._value = result;
                this.dirty = false;
                return result;
            }
            else {
                return this._value;
            }
        },
        set: function (value) {
            this._value = value;
            document.dispatchEvent(this.propertyChange);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BindableProperty.prototype, "objectValue", {
        get: function () {
            if (this.value && typeof (this.value) == "string" && this.value.indexOf("#JSON#") == 0) {
                var obj = JSON.parse(this.value.slice(6));
                if (obj.hasOwnProperty('mutated-accesors')) {
                    var auxAccesors = obj['mutated-accesors'];
                    obj['mutated-accesors'] = [];
                    for (var i in auxAccesors) {
                        var mutatedProp = auxAccesors[i];
                        var oldProp = obj['_' + mutatedProp];
                        ModelProperty.createAccesorProperty(mutatedProp, obj, new BindableProperty(mutatedProp, oldProp["_hashEventName"], oldProp["_value"], obj));
                    }
                }
                return obj;
            }
            else
                return this.value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BindableProperty.prototype, "internalValue", {
        set: function (value) {
            this._value = value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BindableProperty.prototype, "hashEventName", {
        get: function () {
            return this._hashEventName;
        },
        set: function (value) {
            this._hashEventName = value;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(BindableProperty.prototype, "propertyChangeEvent", {
        get: function () {
            return "propertyChange" + this.hashEventName;
        },
        enumerable: true,
        configurable: true
    });
    BindableProperty.prototype.dispatchChangeEvent = function (argName) {
        if (this.dispatchEvents.indexOf(this.propertyChangeEvent) !== -1)
            return;
        if (argName)
            this._externalReference = argName;
        this.dirty = true;
        var elIndex = this.dispatchEvents.push(this.propertyChangeEvent);
        document.dispatchEvent(this.propertyChange);
    };
    return BindableProperty;
})();
