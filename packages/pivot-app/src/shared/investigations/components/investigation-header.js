import styles from './investigations.less';
import {
    Navbar,
    NavItem,
    Nav,
    Glyphicon
} from 'react-bootstrap';
import Select from 'react-select'

export default function InvestigationHeader({id, user, investigations, saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation
}) {
    return (
                <Navbar className={styles['investigation-header']} inverse fixedTop fluid>
                    <Navbar.Form style={{width: '60%', padding: '0'}} pullLeft> 
                        <Select
                            name="investigation-selector"
                            value={id}
                            options={investigations.map((investigation) => ({value: investigation.id, label: investigation.name }))}
                            onChange={(selection) => selectInvestigation(selection.value)}
                            pullLeft
                        />
                    </Navbar.Form>
                    <Nav pullRight>
                        <NavItem eventKey={4} onSelect={() => createInvestigation(user.id)}>
                            <Glyphicon glyph="plus" />
                        </NavItem>
                        <NavItem eventKey={5} onSelect={() => copyInvestigation(id)}>
                            <Glyphicon glyph="duplicate" />
                        </NavItem>
                        <NavItem eventKey={6} onSelect={() => saveInvestigation(id)}>
                            <Glyphicon glyph="floppy-disk" />
                        </NavItem>
                    </Nav>
                </Navbar>
            
    )
}
