type Listener = (...args: any[]) => any;

export class EventBus {
	listeners: Listener[] = [];
	publish = (...args: any[]) => {
		this.listeners.forEach(listener => listener(...args));
	};
	subscribe = (listener: Listener) => {
		this.listeners.push(listener);
		return () => {
			const idx = this.listeners.indexOf(listener);
			if (idx > -1) {
				this.listeners.splice(idx, 1);
			}
		};
	};
}