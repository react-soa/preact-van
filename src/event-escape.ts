import {Navigation} from "./index";

export function backOnEscape(context: Navigation) {
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Escape') {
            context.goBack();
        }
    });
}