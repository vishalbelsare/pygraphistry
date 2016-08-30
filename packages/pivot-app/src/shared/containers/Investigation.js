//import { Investigation } from './Investigation';
import { container } from 'reaxtor-redux';
//import { app as appClassName,
         //frame as graphFrameClassName } from './styles.css';

function renderInvestigation({ name = 'undefined' }) {
    return (
        <option> {name} </option>
    );
}

function mapStateToFragment(investigation = {}) {
    return `{
        name
    }`;
}

export default container(
    mapStateToFragment
)(renderInvestigation);


//export class InvestigationList extends Container {
    //loadProps(model) {
        //return model.getItems(
            //() => `['length']`,
            //({json : { length }} ) =>  !length ? [] : [
                 //[{ length }, 'name']
            //]
        //);
    //}

    //createChild(props) {
        //return new Investigation({
            //...props, field: this.field,
        //});
    //}

    ////loadState(model, props) {
        ////return this.loadProps(model)
    ////}

    //render(model, state, ...investigations) {
        //return (
            //<div>
                //<h3> Current Investigation 
                    //<select>
                        //{ investigations }
                    //</select>
                //</h3>
           //</div>
        //)
    //}
//}
