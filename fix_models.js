const fs = require('fs'); 
const paths = ['models/aws_aaws/tfjs/model.json', 'models/arg/tfjs/model.json']; 
paths.forEach(p => { 
  if (fs.existsSync(p)) {
    let data = fs.readFileSync(p, 'utf8'); 
    data = data.replace(/"batch_shape"/g, '"batchInputShape"'); 
    fs.writeFileSync(p, data); 
    console.log('Fixed ' + p); 
  }
});
