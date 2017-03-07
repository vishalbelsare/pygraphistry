import Helmet from 'react-helmet';
import stringify from 'json-stable-stringify';
import faviconStats from './favicon-stats.json';
import webpackClientStats from './webpack-client-stats.json';

export default function template({
    paths = {},
    clientId = '',
    reactRoot = '',
    initialState = {}
} = {}) {

    const head = Helmet.rewind();
    const { html: iconsHTML } = faviconStats;
    const { base = '', prefix = '' } = paths;
    const { client, vendor } = webpackClientStats;

    // Setup html page
    return `
<!DOCTYPE html>
<html ${head.htmlAttributes.toString()}>
    <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1, shrink-to-fit=no' />
        <meta http-equiv='X-UA-Compatible' content='IE=edge' />
        <meta http-equiv='Content-Language' content='en' />${
            iconsHTML.join('\n')
        }
        ${base && `<base href="${base}">` || ''}
        ${head.title.toString()}
        ${head.meta.toString()}
        ${head.link.toString()}
        <link rel='stylesheet' type='text/css' href='https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css'>
        <link rel="stylesheet" type='text/css' href="https://opensource.keycdn.com/fontawesome/4.7.0/font-awesome.min.css" integrity="sha384-dNpIIXE8U05kAbPhy3G1cz+yZmTzA6CY8Vg/u2L9xRnHjJiAK76m2BIEaSEV+/aU" crossorigin="anonymous">
        ${client && client.css ?`
        <link rel='stylesheet' type='text/css' href='${`${client.css}`}'/>`: ''}
    </head>
    <body class='graphistry-body table-container'>
        <div id='root'>${reactRoot || ''}</div>

        <script type='text/javascript'>
            window.graphistryPath = "${prefix || ''}";
            window.graphistryClientId = "${clientId}";
            window.__INITIAL_CACHE__ = ${stringify(initialState)} || {};
        </script>

        <!--[if gte IE 9 ]>
            <script src='https://cdnjs.cloudflare.com/ajax/libs/es5-shim/4.5.9/es5-shim.min.js'></script>
            <script src='https://cdnjs.cloudflare.com/ajax/libs/es5-shim/4.5.9/es5-sham.min.js'></script>
        <![endif]-->

        ${vendor && vendor.js ? `
        <script type="text/javascript" src="${vendor.js}"></script>` : ''}
        ${client && client.js ? `
        <script type="text/javascript" src="${client.js}"></script>` : ''}
        ${head.script.toString()}
    ${__DEV__ ? `\n` : `
        <script type='text/javascript'>
            (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
            (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
            m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
            })(window,document,'script','//google-analytics.com/analytics.js','ga');
        </script>`
    }
    </body>
</html>`;
};
