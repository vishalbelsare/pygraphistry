import { container } from '@graphistry/falcor-react-redux';


function renderSidebar() {
    return (
        <div className="sidebar" data-color="blue" id="left-nav">
            <div className="sidebar-wrapper">
                <div className="logo">
                    <div className="logo-wrapper">
                        <img src="/custom/img/logo.png"/>
                    </div>
                </div>
                <ul className="nav">
                    <li>
                        <a href="#">
                            <i className="pe-7s-user"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li>
                        <a href="#">
                            <i className="pe-7s-users"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li>
                        <a href="#">
                            <i className="pe-7s-note2"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li className="active">
                        <a href="#">
                            <i className="pe-7s-graph1"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li>
                        <a href="#">
                            <i className="pe-7s-network"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li>
                        <a href="#">
                            <i className="pe-7s-plugin"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>
                    <li>
                        <a href="#" className="new-investigation">
                            <i className="pe-7s-plus"></i>
                            <p>&nbsp;</p>
                        </a>
                    </li>

                </ul>
            </div>
        </div>
    );
}

export default renderSidebar
/*export default container(
    () => {},
    (state) => state,
    {}
)(renderSidebar);*/
