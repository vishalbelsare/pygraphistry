import styles from './investigations.less';
import {
    Navbar,
    NavItem,
    Nav,
    Glyphicon,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap';
import Select from 'react-select'

export default function InvestigationHeader({activeInvestigation, user, investigations = [], saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation
}) {
    const { id } = activeInvestigation;
    return (
                <Navbar className={styles['investigation-header']} inverse fixedTop fluid>
                    <Navbar.Form style={{width: '60%', padding: '0'}} pullLeft>
                        <Select
                            name="investigation-selector"
                            clearable={false}
                            value={id}
                            options={investigations.map((investigation) => ({value: investigation.id, label: investigation.name }))}
                            onChange={(selection) => selectInvestigation(selection.value)}
                            pullLeft
                        />
                    </Navbar.Form>
                    <Nav pullRight>
                        <OverlayTrigger placement="bottom" overlay={
                            <Tooltip id={`createInvestigationTooltip`}>Create New Investigation</Tooltip>
                        }>
                            <NavItem eventKey={4} onSelect={() => createInvestigation(user.id)}>
                                <Glyphicon glyph="plus" />
                            </NavItem>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom" overlay={
                            <Tooltip id={`copyInvestigationTooltip`}>Copy Investigation</Tooltip>
                        }>
                            <NavItem eventKey={5} onSelect={() => copyInvestigation(id)}>
                                <Glyphicon glyph="duplicate" />
                            </NavItem>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom" overlay={
                            <Tooltip id={`saveInvestigationTooltip`}>Save Investigation</Tooltip>
                        }>
                            <NavItem eventKey={6} onSelect={() => saveInvestigation(id)}>
                                <Glyphicon glyph="floppy-disk" />
                            </NavItem>
                        </OverlayTrigger>
                    </Nav>
                </Navbar>
    )
}
