import { container } from '@graphistry/falcor-react-redux';
import { setInvestigationName } from '../actions/investigationList';

function renderInvestigationList({ investigations, setInvestigationName, ...props }) {
    console.log("Props", props);
    return (
        <div className='investigation-list-comp'> { investigations ?
                <select onChange = {(ev) => setInvestigationName(ev)}>
                    { investigations.map((investigation, index) =>
                        <option key={`${index}: ${investigation.name}`}> {investigation.name} </option>
                    )}
                </select> :
                null}
        </div>
    );
}

function mapStateToFragment(investigations = []) {
    return `{
        'length',
        [0...${investigations.length}]: { name }
    }`;
}

function mapFragmentToProps(investigationsList) {
    return { investigations: investigationsList };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps,
    { setInvestigationName: setInvestigationName }
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
