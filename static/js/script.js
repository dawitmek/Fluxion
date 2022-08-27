$('.sidebar ul li ').on('click', function () {
    $('.sidebar ul li.active').removeClass('active');
    $(this).addClass('active');
})

$('.sidebar-btn').on('click', function () {
    if($('.sidebar').hasClass('active')) {
        $('.sidebar').removeClass('active');
    } else {
        $('.sidebar').addClass('active');
    }
})
