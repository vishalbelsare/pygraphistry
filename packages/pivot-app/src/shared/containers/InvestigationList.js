//import { Investigation } from './Investigation';
import Investigation from './Investigation';
import { container } from 'reaxtor-redux';
//import { app as appClassName,
         //frame as graphFrameClassName } from './styles.css';

function renderInvestigationList({ investigations }) {
    return (
        <div>
            Investigations { investigations.length }
            <select>
                { investigations.map((investigation, index) => 
                    <Investigation key={`${index}: ${investigation.name}`} data={investigation} />
                )
                }
            </select>
        </div>
    );
}

function mapStateToFragment(investigations = []) {
    return `{
        'length',
        [0...${investigations.length}]: ${
            Investigation.fragment()
}
        }`;
}

function mapFragmentToProps(investigationsList) {
    return { investigations: investigationsList };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps
)(renderInvestigationList);


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
