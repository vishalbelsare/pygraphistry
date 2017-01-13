import styles from 'pivot-shared/styles.less';
import {
    MenuItem,
    Navbar,
    NavItem,
    NavDropdown,
    Nav,
    Glyphicon
} from 'react-bootstrap';

export default function InvestigationHeader({id, name, user, investigations, saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation
}) {
    return (
                <Navbar className={styles['investigation-header']} inverse fixedTop fluid>
                    <Navbar.Header>
                        <Navbar.Brand>
                            <a href="#"> { name } </a>
                        </Navbar.Brand>
                    </Navbar.Header>
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
                        <NavDropdown eventKey={3} title="Open" id="basic-nav-dropdown">
                            {
                                investigations.map((investigation) => (
                                    <MenuItem
                                        key={investigation.id}
                                        eventKey={investigation.id}
                                        onSelect={(eventKey) => selectInvestigation(eventKey)}
                                    >
                                        { investigation.name }
                                    </MenuItem>)
                                )
                            }
                        </NavDropdown>
                    </Nav>
                </Navbar>
            
    )
}
