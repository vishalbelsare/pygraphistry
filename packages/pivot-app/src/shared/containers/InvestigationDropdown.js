import { container } from '@graphistry/falcor-react-redux';
import { DropdownButton, MenuItem } from 'react-bootstrap';

function InvestigationDropdown({ investigations, selectedInvestigation, setInvestigationName, ...props }) {
    if (investigations.length === 0) {
        return null;
    }
    // debugger
    return (
        <DropdownButton id='investigations-list-dropdown'
                        title={selectedInvestigation.name || 'Investigations'}
                        onSelect={(id, event) => setInvestigationName({ id })}>
        {investigations.map(({ id, name }, index) => (
            <MenuItem eventKey={id} key={`${index}: ${id}`}>
                {name}
            </MenuItem>
        ))}
        </DropdownButton>
    );
}

function mapStateToFragment(investigations = []) {
    return `{
        'length',
        [0...${investigations.length}]: { id, name }
    }`;
}

function mapFragmentToProps(investigationsList) {
    return { investigations: investigationsList };
}

export default container(
    mapStateToFragment,
    mapFragmentToProps
)(InvestigationDropdown);


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
