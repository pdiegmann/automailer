$(function() {
  
  var showInfo = function(message) {
    $('div.progress').hide();
    $('strong.message').text(message);
    $('div.alert').show();
  };
  
  $('#uploadFile').on('click', function(evt) {
    console.log("a");
    evt.preventDefault();
    $('div.progress').show();
    var formData = new FormData();
    var file = document.getElementById('file').files[0];
    formData.append('file', file);
    
    var xhr = new XMLHttpRequest();
    
    xhr.open('post', '/upload', true);
    
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        var percentage = (e.loaded / e.total) * 100;
        $('div.progress div.bar').css('width', percentage + '%');
      }
    };
    
    xhr.onerror = function(e) {
      showInfo('An error occurred while submitting the form. Maybe your file is too big');
    };
    
    xhr.onload = function() {
      showInfo(this.statusText);
    };
    
    xhr.send(formData);
    
  });
  
});