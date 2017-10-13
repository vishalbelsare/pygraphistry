import { Observable } from 'rxjs';
import { VGraphTable } from './partition';
import { runner, RunnerOptions } from './runner';
import { partition, PartitionOptions } from './partition';

export function convertVGraph(runnerOptions: RunnerOptions) {
    const runWorkers = runner(runnerOptions);
    return function convertVGraph(partitionOptions: PartitionOptions) {
        return partition(partitionOptions).concatMap(runWorkers);
    };
}

export { VGraphTable };
export default convertVGraph;
