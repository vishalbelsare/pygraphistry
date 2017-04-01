import styles from './investigations.less';
import {
    Navbar,
    NavItem,
    Nav,
    Glyphicon,
    OverlayTrigger,
    Tooltip
} from 'react-bootstrap';
import { layouts } from '../../services/layouts.js';
import Select from 'react-select'

export default function InvestigationHeader({activeInvestigation, user, investigations = [], saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation, saveLayout
}) {
    const { id } = activeInvestigation;
    const { layout } = activeInvestigation;
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
                    <Navbar.Form style={{color: 'magenta', width: '100%', padding: '0'}} pullLeft>
                        <Select
                            name="layout-selector"
                            clearable={false}
                            value={layout || "weird default"}
                            options={layouts.map((lay) => ({value: lay.id, label: lay.friendlyName}))}
                            onChange={(lay) => saveLayout({layoutType: lay.value})}
                            pullLeft
                        />
                    </Navbar.Form>
                </Navbar>
    )
}
