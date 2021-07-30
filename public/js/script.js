
function updateQR(){
    fetch("/codigo").then(resp=>{
        console.log()
        resp.json().then(codigo=>{
            
            if(codigo !=null && codigo.src !=null){
                document.getElementById("waqrcode").src = codigo.src;
            }
            
        }).catch(err=>{
            console.log(err)
        })
    }).catch(err=>{
        console.log(err)
    })
}

function actualizaQR(){
    fetch("/codigo").then(resp=>{
        resp.json().then(codigo=>{
            if(codigo.clientReady){
                window.location.href = "/inicio";
            }else{
                document.getElementById("waqrcode").src = codigo.src
            }
        })        
    }).catch(err=>{
        console.log(err)
    })
}

function reconectar(){
    fetch("/reconectar").then(resp=>{
        resp.json().then(status=>{
            window.location.href = "/inicio";            
        }).catch(err=>{
            console.log(err)
        })
    }).catch(err=>{
        console.log(err)
    })
}

function actualizaEstado(){
    window.location.href = "/inicio";  
}


