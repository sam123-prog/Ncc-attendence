function login(){

let user = document.getElementById("username").value

if(user === "admin"){
window.location = "admin.html"
}
else{
window.location = "dashboard.html"
}

}

// Dashboard Data

if(document.getElementById("name")){

document.getElementById("name").innerText = cadet.name
document.getElementById("reg").innerText = "Reg No: " + cadet.reg
document.getElementById("attendance").innerText = "Attendance: " + cadet.attendance

let table = document.getElementById("attendanceTable")

records.forEach(r=>{
table.innerHTML +=
`<tr>
<td>${r.date}</td>
<td>${r.parade}</td>
<td>${r.status}</td>
</tr>`
})

}

// Admin Table

if(document.getElementById("cadetTable")){

let table = document.getElementById("cadetTable")

cadets.forEach(c=>{
table.innerHTML +=
`<tr>
<td>${c.name}</td>
<td>${c.reg}</td>
<td>${c.attendance}</td>
</tr>`
})

}
