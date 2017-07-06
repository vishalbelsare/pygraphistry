import * as path from 'path';
import * as mkdirp from 'mkdirp';
import { spawn as spawnRx } from 'spawn-rx';
import { Observable, Scheduler } from 'rxjs';

export interface CreateDBOptions {
    dbName: string;
    mapdDir: string;
    username: string;
    password: string;
    mapdDataDir: string;
}

export function createDB(opts: CreateDBOptions) {

    const { dbName, username, password } = opts;
    const mapdDir = path.resolve(resolveHome(opts.mapdDir));
    const mapdDataDir = path.resolve(resolveHome(opts.mapdDataDir));
    const startMapDCmd = runCmd(
        path.join(mapdDir, '../startmapd'), [
            `--no-frontend`,
            `--non-interactive`,
            `--data`, mapdDataDir,
            `--cpu`
        ],
        'startmapd',
        { cwd: mapdDir, detached: true, ignoreErrors: true }
    );
    const mapdQLCmd = runCmd(path.join(mapdDir, './bin/mapdql'), [`-u`, `mapd`, `-p`, `HyperInteractive`], 'mapdql', {
        cwd: mapdDir,
        stdin: Observable.of(
            `CREATE USER ${username} (password = 'tmp_password', is_super = 'false');\n`,
            `ALTER USER ${username} (password = '${password}');\n`,
            `CREATE DATABASE ${dbName} (owner = '${username}');\n`,
            `\\q\n`,
            Scheduler.async
        )
    });

    return startMapDCmd
        .do((x) => console.log(`mapd_server msg: ${x}`))
        .debounceTime(5000).filter((x, index) => index === 0)
        .flatMapTo(mapdQLCmd
            .do((x) => console.log(`mapdql msg: ${x}`))
            .takeLast(1))
        .filter((x, index) => index === 0)
        .mapTo({ dbName, username, password, mapdDir });
}

function runCmd(cmd, args, tag, { ignoreErrors, ...opts }: any = {}) {
    return Observable.defer(() => {
        console.log(`running ${tag}: ${cmd} ${args.join(' ')}`);
        return Observable.from(spawnRx(cmd, args, { ...opts, split: true }))
            .catch((e) => Observable.throw(new Error(`${tag} error: ${e}`)))
            .map(({ source, text }) => {
                if (!ignoreErrors && source === 'stderr') {
                    throw new Error(`${tag} error: ${text}`)
                }
                return text;
            })
    });
}

function resolveHome(_path) {
    return (_path[0] !== '~') ? _path : path.resolve(process.env.HOME, _path.slice(1))
}
