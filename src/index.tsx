import {Component, createContext, h} from "preact";
import {useContext} from "preact/hooks";
import {Channel} from "./channel";
import {EventBus} from "./event-bus";

export type Blueprint = {
    name: string;
    type: 'experiment' | 'flow';
    experiment: string;
    variant: string;
    back: string;
    component: any;
    children: any;
    metadata: any;
    root: boolean;
}

export type NavigationEvents = 'change' | 'close' | 'load'

export type Navigation = {
    head: string;
    changePath(name: string);
    goBack();
    finish();
    silentGoto(name: string);
    changeFlow(name: string, onFinish?: () => any);
    addEventListener: (event: NavigationEvents, listener: any) => any;
    removeEventListener: (event: NavigationEvents, listener: any) => any;
    metadata: {
        publish: (event: NavigationEvents, ...args: any[]) => any;
        memory: any;
        bus: EventBus,
        channel: Channel,
        blueprints: Blueprint[],
        variantCustomization: { [key: string]: string };
    }
};

export const VanContext = createContext<Navigation>({} as Navigation);

export function useNav() {
    return useContext(VanContext);
}

function findBlueprint(navigation: Navigation, name: string): [number, Blueprint] {
    for (let i = 0; i < navigation.metadata.blueprints.length; i++) {
        const blueprint = navigation.metadata.blueprints[i];
        if (blueprint.name === name) {
            if (!blueprint.experiment) {
                return [i, blueprint];
            }
            const preferredVariant = navigation.metadata.variantCustomization[blueprint.experiment];
            if (!preferredVariant || blueprint.variant === preferredVariant) {
                return [i, blueprint];
            }
        }
    }
    return [-1, null];
}

export function createNavigation(name: string, options?: {
    variantCustomization?: any
}) {
    const bus = new EventBus();
    const channel = new Channel();
    const navigation: Navigation = {
        head: name,
        addEventListener: (event, listener) => channel.subscribe(event, listener),
        removeEventListener: (event, listener) => channel.unsubscribe(event, listener),
        changeFlow(name: string, onFinish?: () => any) {
            bus.publish('changeFlow', name, onFinish);
        },
        changePath(name: string) {
            bus.publish('changePath', name);
        },
        finish() {
            bus.publish('finish');
        },
        goBack() {
            bus.publish('goBack');
        },
        silentGoto(name: string) {
            this.head = name;
            bus.publish('silentGoto', name);
        },
        metadata: {
            publish: (event, ...args: any[]) => channel.publish(event, ...args),
            blueprints: [],
            memory: {},
            channel: channel,
            bus: bus,
            variantCustomization: (options && options.variantCustomization) ? options.variantCustomization : {}
        }
    };
    return navigation;
}

const RouteContext = createContext<{
    type?: 'experiment' | 'flow';
    experiment?: string;
    variant?: string;
}>({});

export function Experiment(props: { children?: any; name: string, flow?: boolean }) {
    return (
        <RouteContext.Provider value={{experiment: props.name, type: props.flow ? 'flow' : 'experiment'}}>
            {props.children}
        </RouteContext.Provider>
    );
}

export function Variant(props: { children?: any; name: string }) {
    const context = useContext(RouteContext);
    return (
        <RouteContext.Provider value={{...context, variant: props.name}}>
            {props.children}
        </RouteContext.Provider>
    );
}

export function Route(props: {
    children?: any;
    name: string; metadata?: any;
    path?: string;
    back?: string;
    root?: boolean;
    component?: any;
}) {
    const context = useContext(RouteContext);
    const nav = useContext(VanContext);
    nav.metadata.blueprints.push({
        name: props.name,
        type: context.type,
        experiment: context.experiment,
        variant: context.variant,
        back: props.back,
        component: props.component,
        metadata: props.metadata,
        children: props.children,
        root: props.root,
    });
    return null;
}

function dynamicMetadata(metadata: any) {
    if (typeof metadata === 'function') {
        return metadata();
    } else {
        return metadata;
    }
}

export function NavProvider(props: { context: Navigation; children: any }) {
    return (
        <VanContext.Provider value={props.context}>
            {props.children}
            <Handler/>
        </VanContext.Provider>
    );
}

class Handler extends Component {
    static contextType = VanContext;
    state = {head: null};
    blueprint: Blueprint = null;
    release: any = null;

    constructor(props, context: Navigation) {
        super(props, context);
        const [idx, blueprint] = findBlueprint(context, context.head);
        if (idx > -1) {
            context.metadata.publish('load');
            context.metadata.publish('change', dynamicMetadata(blueprint.metadata));
            this.blueprint = blueprint;
            this.state = {
                head: blueprint.name,
            };
        }
    }

    componentDidMount(): void {
        const context = ((this as any).context) as Navigation;
        this.release = context.metadata.bus.subscribe(async (method: string, ...args: any[]) => {
            const [idx, current] = findBlueprint(context, context.head);
            let prev = context.head;
            const memory = context.metadata.memory;

            function swap(found: Blueprint) {
                if (idx > -1 && !found.root) {
                    memory.history = memory.history || {};
                    memory.history[found.name] = current.name;
                    memory.flow = memory.flow || {};
                    memory.flow[current.experiment] = current.name;
                }
            }

            if (method === 'changePath') {
                const [idx, blueprint] = findBlueprint(context, args[0]);
                if (idx > -1) {
                    swap(blueprint);
                    context.head = blueprint.name;
                    this.blueprint = blueprint;
                    this.setState({
                        head: blueprint.name,
                    });
                    context.metadata.memory.head = blueprint.name;
                    context.metadata.publish('change', dynamicMetadata(blueprint.metadata));
                }
            } else if (method === 'silentGoto') {
                const [idx, blueprint] = findBlueprint(context, args[0]);
                if (idx > -1) {
                    context.head = blueprint.name;
                    this.blueprint = blueprint;
                    this.setState({
                        head: blueprint.name,
                    });
                    context.metadata.memory.head = blueprint.name;
                    context.metadata.publish('change', dynamicMetadata(blueprint.metadata));
                }
            } else if (method === 'finish') {
                if (memory.events) {
                    const fn = memory.events[current.experiment];
                    if (typeof fn === 'function' && await fn() === false) {
                        memory.events[current.experiment] = undefined;
                        return;
                    }
                    memory.events[current.experiment] = undefined;
                }
                if (memory.flow) {
                    prev = memory.flow[current.experiment];
                }
                const [idx, blueprint] = findBlueprint(context, prev);
                if (idx > -1) {
                    context.head = blueprint.name;
                    this.blueprint = blueprint;
                    this.setState({
                        head: blueprint.name,
                    });
                    context.metadata.memory.head = blueprint.name;
                    context.metadata.publish('change', dynamicMetadata(blueprint.metadata));
                }
            } else if (method === 'goBack') {
                if (current.root) {
                    context.metadata.publish('close', dynamicMetadata(current.metadata));
                    return;
                }
                if (current.type === 'flow') {
                    if (typeof current.back !== 'undefined') {
                        const [idx, blueprint] = findBlueprint(context, current.back);
                        if (idx > -1) {
                            prev = blueprint.name;
                        }
                    } else {
                        const currentFlow = context.metadata.blueprints.filter(a => a.experiment === current.experiment && a.variant === current.variant);
                        const idx = currentFlow.findIndex(a => a.name === current.name);
                        if (idx === 0) {
                            if (memory.flow && memory.flow[current.experiment]) {
                                prev = memory.flow[current.experiment];
                            }
                        } else if (idx > 0) {
                            prev = currentFlow[idx - 1].name;
                        }
                    }
                } else if (current.type === 'experiment') {
                    if (memory.history && memory.history[current.name]) {
                        prev = memory.history[current.name];
                    }
                    if (typeof current.back !== 'undefined') {
                        prev = current.back;
                    }
                }
                if (prev) {
                    const [idx, blueprint] = findBlueprint(context, prev);
                    if (idx > -1) {
                        context.head = blueprint.name;
                        this.blueprint = blueprint;
                        this.setState({
                            head: blueprint.name,
                        });
                        context.metadata.memory.head = blueprint.name;
                        context.metadata.publish('change', dynamicMetadata(blueprint.metadata));
                    }
                }
            } else if (method === 'changeFlow') {
                const name = args[0];
                const next = context.metadata.blueprints.find(a => a.experiment === name && context.metadata.variantCustomization[name] === a.variant);
                if (next && current.experiment !== name) {
                    const [idx, blueprint] = findBlueprint(context, next.name);
                    if (idx > -1) {
                        swap(next);
                        memory.events = memory.events || {};
                        memory.events[blueprint.experiment] = args[1];
                        context.head = blueprint.name;
                        this.blueprint = blueprint;
                        this.setState({
                            head: blueprint.name,
                        });
                        context.metadata.memory.head = blueprint.name;
                        context.metadata.publish('change', dynamicMetadata(blueprint.metadata));
                    }
                }
            }
        });
    }

    componentWillUnmount(): void {
        this.release();
    }

    render() {
        const {head} = this.state;
        if (typeof head === 'undefined') {
            return null;
        }
        if (!this.blueprint) {
            return null;
        }
        if (typeof this.blueprint.component !== 'undefined') {
            return h(this.blueprint.component, {});
        }
        return this.blueprint.children;
    }
}