import { Toolbar } from '../toolbar';

export function ViewFragment({ toolbar } = {}) {
    return `{
        toolbar: ${
            Toolbar.fragment(toolbar)
        }
    }`;
}

/*
import { Sets } from '../sets';
import { Scene } from '../scene';
import { Filters } from '../filters';
import { Timebar } from '../timebar';
import { Toolbar } from '../toolbar';
import { Settings } from '../settings';
import { Inspector } from '../inspector';
import { Exclusions } from '../exclusions';
import { Histograms } from '../histograms';

export function ViewFragment({
    sets, scene,
    timebar, toolbar, filters, settings,
    inspector, exclusions, histograms } = {}) {
    return `{
        sets: ${
            Sets.fragment(sets)
        },
        scene: ${
            Scene.fragment(scene)
        },
        filters: ${
            Filters.fragment(filters)
        },
        timebar: ${
            Timebar.fragment(timebar)
        },
        toolbar: ${
            Toolbar.fragment(toolbar)
        },
        settings: ${
            Settings.fragment(settings)
        },
        inspector: ${
            Inspector.fragment(inspector)
        },
        exclusions: ${
            Exclusions.fragment(exclusions)
        },
        histograms: ${
            Histograms.fragment(histograms)
        }
    }`;
}

*/
