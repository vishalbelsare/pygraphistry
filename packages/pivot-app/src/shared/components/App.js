import { Table } from './Table';
import { Observable } from 'rxjs';
import { Component } from 'reaxtor';
import { app as appClassName,
         frame as graphFrameClassName } from './styles.css';

export class App extends Component {
    initialize(models, depth) {

        const iFrame = new GraphFrame({
            models: models.pluck(0),
            index: 0, depth: depth + 1,
        });

        const table = new Table({
            models: models.pluck(0),
            index: 1, depth: depth + 1,
        });

        return models.switchMapTo(
            Observable.combineLatest(iFrame, table),
            (componentInfo, childVDoms) => [ ...componentInfo, ...childVDoms]
        )
    }
    loadProps(model) {
        return model.get(`['title', 'total']`);
    }
    render(model, { title }, iFrame, table) {
        return (
            <div id='app' key_='app' class_={{ [appClassName]: true }}>
                {iFrame}
                <h2>{title}</h2>
                {table}
            </div>
        );
    }
}

class GraphFrame extends Component {
    loadProps(model) {
        return model.get(`['url', 'total', 'urls', 'urlIndex']`);
    }
    render(model, { url, total, urls, urlIndex }) {
        return (
            <iframe
                src={`${url}`}
                style='width:100%; height:700px; border:1px solid #DDD' />
        );
    }
} 
