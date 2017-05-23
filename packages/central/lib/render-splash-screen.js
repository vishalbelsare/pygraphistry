export function renderSplashScreen(originalURL) {
    return `
<!DOCTYPE html>
<html lang="en">

  <head>
    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
    <meta charSet='utf-8' />
    <meta httpEquiv="Content-Language" content="en" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" type="text/css" href="css/reset.min.css">
    <link rel="stylesheet" type="text/css" href="css/normalize.min.css">
    <title>Graphistry\'s Graph Explorer</title>
    <style>
    .graphistry-body {
        height: 100%;
        overflow: hidden;
        background-color: #333339;
    }
    .splash {
        top: 50%;
        left: 50%;
        position: fixed;
        cursor: pointer;
        margin-top: -150px;
        margin-left: -182px;
        visibility: visible;
        text-align: center;
        vertical-align: top;
        text-decoration: none;
    }
    .splash span {
        color: #EEE;
        margin-top: 1em;
        display: block;
    }
    .splash:hover img, .splash:hover span {
        filter: drop-shadow(0px 0px 25px rgba(255,255,255,0.5));
        -webkit-filter: drop-shadow(0px 0px 25px rgba(255,255,255,0.5));
    }
    </style>
  </head>

  <body class='graphistry-body'>
    <a class='splash' href='${originalURL}' title='Launch Visualization'>
        <img src='/img/logowhite.png'></img>
        <span>Launch Visualization</span>
    </a>
    <script type="text/javascript">
        (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
        (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
        m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
        })(window,document,'script','//google-analytics.com/analytics.js','ga');
    </script>
  </body>
</html>`;
}
