/// <reference path="ModelProperty.ts" />
/// <reference path="BindableProperty.ts" />
/// <reference path="IDictionary.ts" />

//IE Fix
(function() {
	function CustomEvent(event, params) {
		params = params || { bubbles: false, cancelable: false, detail: undefined };
		var evt = document.createEvent('CustomEvent');
		evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
		return evt;
	}

	CustomEvent.prototype = Event.prototype;
	window["CustomEvent"] = CustomEvent;
})();

class ModelView<T> {
	originalModel: any;
	properties: Array<ModelProperty<T>>;
	model: any;
	subModels: Array<ModelView<any>>;
	isInitialization: boolean;

	private _modelName: string;

	get dispatchEvents(): Array<string> {
		if (!window["dt-dispatchEvents"])
			window["dt-dispatchEvents"] = [];

		return <Array<string>>window["dt-dispatchEvents"];
	}

	get bindings(): IDictionary<BindableProperty> {
		return <IDictionary<BindableProperty>>window[this.modelName + "_dt-bindings"];
	}

	set bindings(value: IDictionary<BindableProperty>) {
		window[this.modelName + "_dt-bindings"] = value;
	}

	get modelName(): string {
		return this._modelName;
	}

	set modelName(value: string) {
		this._modelName = value;
	}

	constructor(modelName: string, model: { new (): T; }, elementContainer?: Element, elementModel?: string, oriModel?: ModelView<any>) {
		this.modelName = modelName;
		this.properties = new Array<ModelProperty<T>>();
		if (!this.bindings)
			this.bindings = {};
		this.subModels = new Array<ModelView<any>>();
		this.isInitialization = true;

		if (oriModel)
			this.originalModel = oriModel;
		else
			this.originalModel = this;

		if (model) {
			this.model = model;
			if (!model["mutated-observation"])
				this.createObservableObject(this.model, this.modelName);
			else {
				var auxAccesor = model["mutated-accesors"];

				for (var i in auxAccesor) {
					var newBindName = this.modelName + '|' + auxAccesor[i];
					var oldBind = model["_" + auxAccesor[i]];
					oldBind.name = this.modelName + '|' + auxAccesor[i];
					this.bindings[newBindName] = oldBind;
				}
			}
		}

		if (modelName) {
			var docElements: Array<Element> = [];

			if (elementContainer) {
				var totalDocElements = Array.prototype.slice.call(elementContainer.querySelectorAll("[data-dt='" + elementModel + "']"));
				var exclude = Array.prototype.slice.call(elementContainer.querySelectorAll('[data-dt=' + elementModel + '] [data-dt=' + elementModel + ']'));

				if (totalDocElements.length !== exclude.length) {
					for (var k = 0; k < totalDocElements.length; k++)
						if (exclude.indexOf(totalDocElements[k]) === -1)
							docElements.push(totalDocElements[k]);

				}
				else
					docElements = totalDocElements;

				var mdContainer = new ModelProperty(this, <HTMLElement>elementContainer);
				this.properties.push(mdContainer);
			}
			else
				docElements = Array.prototype.slice.call(document.querySelectorAll("[data-dt='" + modelName + "']"));

			if (docElements.length > 0) {
				docElements.forEach((element, index) => {
					var newProperty = new ModelProperty(this, <HTMLElement>element);
					this.properties.push(newProperty);
				});
			}

			this.properties.forEach(n => {
				for (var bindName in n.internalBindings)
					n.setComponentBinding(n.bindings[bindName]);
			});
		}

		this.isInitialization = false;
	}


	private createObservableObject(obj: any, parentName?: string): void {
		if (typeof (obj) !== "object" || (obj && obj["mutated-observation"]))
			return;

		var parentPropName = "";

		if (parentName)
			parentPropName = parentName;

		var oriProps = [];

		for (var objProp in obj)
			oriProps.push(objProp)

		for (var objProp in oriProps) {
			var propertyName = oriProps[objProp];
			if (propertyName.indexOf('_') != 0 && typeof (obj[propertyName]) !== "function"
				&& propertyName !== "mutated-accesors" && propertyName.indexOf('$') != 0) {

				var propertyBindName = parentPropName + "|" + propertyName;

				var result: BindableProperty = this.bindings[propertyBindName];

				if (typeof (result) === "undefined") {
					result = new BindableProperty(propertyBindName, propertyName,
						obj[propertyName], obj, this.originalModel.model, null, true);
				}

				ModelProperty.createAccesorProperty(propertyName, obj, result);

				this.createObservableObject(obj[propertyName], propertyBindName);
				this.bindings[propertyBindName] = result;

				document.addEventListener(result.propertyChangeEvent,
					(args: CustomEvent) => {
						if (!this.isInitialization) {
							this.checkBindDependencies(args);

							if (obj["_parentReference"] && obj["_parentReference"]._binding) {
								this.dispatchEvents.push(args.detail.propertyChangeEvent);
								obj["_parentReference"]._binding.dispatchChangeEvent(args.detail.internalExpression);
							}
						}

					}, false);
			}
		}

		if (obj != null)
			obj["mutated-observation"] = true;
	}

	checkBindDependencies(args: CustomEvent): void {
		var name = args.detail.internalExpression;

		if (args.detail["_externalReference"] && args.detail["_externalReference"] != null)
			name = args.detail["_externalReference"];

		for (var bindingName in this.bindings) {
			var binding = this.bindings[bindingName];

			if ((binding.internalExpression.indexOf('#') == 0 || binding.isFunction) && binding.internalExpression !== name) {
				var expr = binding.internalExpression;

				if (binding.isFunction)
					expr = binding.funcDefinition;

				if (this.containsBindReference(expr, name))
					binding.dispatchChangeEvent();
				else if (this.containsBindReference(expr, '$' + name))
					binding.dispatchChangeEvent();
				else if (this.containsBindReference(expr, name + '_stringify'))
					binding.dispatchChangeEvent();
			}
		}
	}

	static isAlphanumeric(str: string, i: number): boolean {
		var code = str.charCodeAt(i);
		if (!(code > 47 && code < 58) && // numeric (0-9)
			!(code > 64 && code < 91) && // upper alpha (A-Z)
			!(code > 96 && code < 123)) { // lower alpha (a-z)
			return false;
		}
		return true;
	}

	private containsBindReference(bindingName: string, reference: string): boolean {
		var res = false;

		var startIndex = bindingName.indexOf(reference);

		while (startIndex != -1) {
			if (bindingName[startIndex - 1] === '.' && bindingName.length >= startIndex + reference.length
				&& !ModelView.isAlphanumeric(bindingName, startIndex + reference.length)) {
				res = true;
				startIndex = -1;
			}
			else {
				startIndex = bindingName.indexOf(reference, startIndex + 1);
			}
		}

		return res;
	}
}
