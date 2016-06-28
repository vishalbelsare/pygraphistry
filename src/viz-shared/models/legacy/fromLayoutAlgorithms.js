export function fromLayoutAlgorithms(algorithms) {
    return algorithms.map(({ algo, params }) => ({
        name: algo.name, params: Object
            .keys(params)
            .map((name) => params[name]
                .toClient(name, algo.name))
    }));
}
