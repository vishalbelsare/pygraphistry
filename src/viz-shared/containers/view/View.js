import React from 'react'
import { connect } from 'reaxtor-redux';
import { Col } from 'react-bootstrap';
import { Toolbar } from '../../toolbar/containers';

// import { Sets } from '../sets';
// import { Scene } from '../scene';
// import { Filters } from '../filters';
// import { Settings } from '../settings';
// import { Inspector } from '../inspector';
// import { Exclusions } from '../exclusions';
// import { Histograms } from '../histograms';

function View({
        title = '',
        sets = [], scene = [],
        toolbar = [], filters = [],
        settings = [], inspector = [],
        exclusions = [], histograms = [],
    } = {}) {
    return (
        <Col xs={1} md={1} lg={1}>
            <Toolbar falcor={toolbar}/>
        </Col>
    );
}

function mapStateToFragment({ toolbar } = {}) {
    return `{
        toolbar: ${
            Toolbar.fragment(toolbar)
        }
    }`;
}

export default connect(
    mapStateToFragment
)(View);



    //     <View title={title}>
    //         <Scene {...scene}/>
    //         <Panel expanded={true}>
    //             <Panel expanded={
    //                     sets.open ||
    //                     filters.open ||
    //                     settings.open ||
    //                     exclusions.open}>
    //                 {settings.open ? (
    //                     <Settings settings={settings}/>
    //                 ) : null}
    //                 {sets.open ? (
    //                     <Sets sets={sets}/>
    //                 ): null}
    //                 {filters.open ? (
    //                     <Filters filters={filters}/>
    //                 ): null}
    //                 {exclusions.open ? (
    //                     <Exclusions exclusions={exclusions}/>
    //                 ): null}
    //             </Panel>
    //             <Toolbar {...toolbar}/>
    //         </Panel>
    //         <Panel expanded={histograms.open}>
    //             <Histograms histograms={histograms}/>
    //         </Panel>
    //         <Panel expanded={inspector.open}>
    //             <Inspector inspector={inspector}/>
    //         </Panel>
    //     </View>
