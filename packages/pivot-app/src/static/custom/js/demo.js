//better as https://github.com/facebook/react/issues/140#issuecomment-120505647 ..
$(function () {
    $("#left-nav").attr('data-color', 'blue');
    setInterval(function () {
        $(function () { $("#left-nav").attr('data-color', 'blue'); });
    }, 1000);
});
