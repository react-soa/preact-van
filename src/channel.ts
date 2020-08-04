type Listener = (...args: any[]) => any;

export class Channel {
	listeners: {[key:string]: Listener[]} = {};
	publish = (event: string, ...args: any[]) => {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].forEach(listener => listener(...args));
	};
	subscribe = (event: string, listener: Listener) => {
		this.listeners[event] = this.listeners[event] || [];
		this.listeners[event].push(listener);
		return () => {
			const idx = this.listeners[event].indexOf(listener);
			if (idx > -1) {
				this.listeners[event].splice(idx, 1);
			}
		};
	};
	unsubscribe = (event: string, listener: Listener) => {
		this.listeners[event] = this.listeners[event] || [];
		const idx = this.listeners[event].indexOf(listener);
		if (idx > -1) {
			this.listeners[event].splice(idx, 1);
		}
	};
}