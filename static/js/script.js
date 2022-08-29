$('.sidebar ul li ').on('click', function () {
    $('.sidebar ul li.active').removeClass('active');
    $(this).addClass('active');
})

$('.sidebar-btn').on('click', function () {
    if ($('.sidebar').hasClass('active')) {
        $('.sidebar').removeClass('active');
    } else {
        $('.sidebar').addClass('active');
    }
})

$('.close-btn').on('click', function () {
    $('.sidebar').removeClass('active');

})

$('#positive-input').change( function () {
    if($('#positive-input').is(':checked')) {
        console.log('has been checked');
    }
})

// $('#grid-length-selector').change( function () {
//     let grid = $(this);
//     console.log(grid.val());
// })