import Select from 'react-select'
import styles from './investigation-header.less';
import { layouts } from '../../services/layouts';
import {
    Grid, Row, Col,
    Button, ButtonGroup,
    Glyphicon, OverlayTrigger, Tooltip
} from 'react-bootstrap';

export default function InvestigationHeader({activeInvestigation, user, investigations = [], saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation, saveLayout
}) {
    const { id } = activeInvestigation;
    const { layout } = activeInvestigation;
    return (
        <Grid fluid className={styles['investigation-header']}>
            <Row className={`${styles['investigation-header-row']} ${styles['investigation-header-nav']}`}>
                <Col className={styles['investigation-header-col']} xs={8} sm={8} md={8} lg={8}>
                    <Select
                        name='investigation-selector'
                        clearable={false}
                        value={id}
                        options={investigations.map((investigation) => ({value: investigation.id, label: investigation.name }))}
                        onChange={(selection) => selectInvestigation(selection.value)}
                    />
                </Col>
                <Col className={styles['investigation-header-col']} xs={4} sm={4} md={4} lg={4}>
                    <ButtonGroup justified className={styles['investigation-header-nav-items']}>
                        <OverlayTrigger
                            placement="bottom"
                            overlay={
                                <Tooltip id={`createInvestigationTooltip`}>Create New Investigation</Tooltip>
                            }>
                            <Button onClick={() => createInvestigation(user.id)}>
                                <Glyphicon glyph="plus" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger
                            placement="bottom"
                            overlay={
                                <Tooltip id={`copyInvestigationTooltip`}>Copy Investigation</Tooltip>
                            }>
                            <Button onClick={() => copyInvestigation(id)}>
                                <Glyphicon glyph="duplicate" />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger
                            placement="bottom"
                            overlay={
                                <Tooltip id={`saveInvestigationTooltip`}>Save Investigation</Tooltip>
                            }>
                            <Button onClick={() => saveInvestigation(id)}>
                                <Glyphicon glyph="floppy-disk" />
                            </Button>
                        </OverlayTrigger>
                    </ButtonGroup>
                </Col>
            </Row>
            <Row className={styles['investigation-header-row']}>
                <Col xs={12} sm={12} md={12} lg={12}>
                    <Select
                        name="layout-selector"
                        clearable={false}
                        value={layout || "weird default"}
                        options={layouts.map((lay) => ({value: lay.id, label: lay.friendlyName}))}
                        onChange={(lay) => saveLayout({layoutType: lay.value})}
                    />
                </Col>
            </Row>
        </Grid>
    );
}
/*
export default function InvestigationHeader({activeInvestigation, user, investigations = [], saveInvestigation,
    createInvestigation, copyInvestigation, selectInvestigation, saveLayout
}) {
    const { id } = activeInvestigation;
    const { layout } = activeInvestigation;
    return (
        <div className={styles['investigation-header']}>
            <Navbar className={styles['investigation-header-navbar']} fluid inverse fixedTop collapseOnSelect>
                <Navbar.Header>
                    <Navbar.Form pullLeft style={{ width: '60%' }}>
                        <Select
                            name="investigation-selector"
                            clearable={false}
                            value={id}
                            options={investigations.map((investigation) => ({value: investigation.id, label: investigation.name }))}
                            onChange={(selection) => selectInvestigation(selection.value)}
                        />
                    </Navbar.Form>
                    <Navbar.Toggle />
                </Navbar.Header>
                <Navbar.Collapse>
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
                </Navbar.Collapse>
            </Navbar>
            <Select
                name="layout-selector"
                clearable={false}
                value={layout || "weird default"}
                options={layouts.map((lay) => ({value: lay.id, label: lay.friendlyName}))}
                onChange={(lay) => saveLayout({layoutType: lay.value})}
            />
        </div>
    );
}
*/
