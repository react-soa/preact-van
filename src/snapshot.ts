import {Navigation} from "./index";

export function getSnapshot(context: Navigation) {
    return context.metadata.memory;
}

export function restoreSnapshot(context: Navigation, data: any) {
	if(!!data) {
		if(data.head) {
			context.silentGoto(data.head);
		}
		context.metadata.memory = data;
	}
}


export function browserPersist(context: Navigation, data: any, onSave: (data: any) => any) {
    try {
        restoreSnapshot(context, JSON.parse(data));
    } catch (e) {
        console.error('failed restoring nav', e)
    }
    ['visibilitychange', 'pagehide', 'freeze'].forEach((type) => {
        window.addEventListener(type, () => {
            if (type === 'visibilitychange' && document.visibilityState === 'visible') return;
            onSave(JSON.stringify(getSnapshot(context)));
        }, {capture: true});
    });
}