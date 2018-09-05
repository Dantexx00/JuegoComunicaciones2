var express = require('express');
var app = express();
var serv = require('http').Server(app);
var PORT = 2000;

app.get('/', function(req, res){
	res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

serv.listen(PORT);
console.log('Server started');

var MAX_WIDTH = 500;
var MIN_WIDTH = 0;
var MAX_HIGH = 500;
var MIN_HIGH = 0;

var SOCKET_LIST = {};

var Entity = function(){
	var self = {
		x:MAX_WIDTH/2,
		y:MAX_HIGH/2,
		spdX:0,
		spdY:0,
		id:"",
	}
	self.update = function(){
		self.updatePosition();
	}
	self.updatePosition = function(){
		self.x += self.spdX;
		self.y += self.spdY;
	}
	self.getDistance = function(pt){
		return Math.sqrt(Math.pow(self.x - pt.x,2) + Math.pow(self.y - pt.y,2));
	}
	return self;
}

var Player = function(id){
	var self = Entity();
	self.id = id;
	self.name = "";
	self.pressingRight = false;
	self.pressingLeft = false;
	self.pressingDown = false;
	self.pressingUp = false;
	self.pressingAttack = false;
	self.mouseAngle = 0;
	self.maxSpd = 10;
	self.score = 0;
	
	var super_update = self.update;
	self.update = function(){
		self.updateSpd();
		super_update();
		
		if(self.pressingAttack){
			self.shootBall(self.mouseAngle);
		}
	}
	
	self.shootBall= function(angle){
		var ball = Ball(self.id, angle);
		ball.x = self.x;
		ball.y = self.y;
	}
	
	self.updateSpd = function(){
		if(self.pressingRight && self.x < MAX_WIDTH){
			self.spdX = self.maxSpd;
		}
		else if(self.pressingLeft && self.x > MIN_WIDTH){
			self.spdX = -self.maxSpd;
		}
		else{
			self.spdX = 0;
		}
		if(self.pressingUp && self.y > MIN_HIGH){
			self.spdY = -self.maxSpd;
		}
		else if(self.pressingDown && self.y < MAX_HIGH){
			self.spdY = self.maxSpd;
		}
		else{
			self.spdY = 0;
		}
	}
	Player.list[id] = self;
	
	return self;
}

Player.list = {};
Player.onConnect = function(socket){
	var player = Player(socket.id);
	
	socket.on('keyPress', function(data){
		if(data.inputId === 'left'){
			player.pressingLeft = data.state;
		}
		else if(data.inputId === 'right'){
			player.pressingRight = data.state;
		}
		else if(data.inputId === 'down'){
			player.pressingDown = data.state;
		}
		else if(data.inputId === 'up'){
			player.pressingUp = data.state;
		}
		else if(data.inputId === 'attack'){
			player.pressingAttack = data.state;
		}
		else if(data.inputId === 'mouseAngle'){
			player.mouseAngle = data.state;
		}
	});
	socket.on('name', function(data){
		player.name = data.name;
		initPack.player.push({
			id:player.id,
			x:player.x,
			y:player.y,
			name:player.name
		});
	});
}

Player.onDisconnect = function(socket){
	delete Player.list[socket.id];
	removePack.player.push(socket.id);
}

Player.update = function(){
	var pack = [];
	for(var i in Player.list){
		var player = Player.list[i];
		player.update();
		pack.push({
			id:player.id,
			x:player.x,
			y:player.y,
			name:player.name,
			score:player.score
		});
	}
	return pack;
}

var Ball = function(parent, angle){
	var self = Entity();
	self.id = Math.random();
	self.spdX = Math.cos(angle/180*Math.PI)*10;
	self.spdY = Math.sin(angle/180*Math.PI)*10;
	self.parent = parent;
	self.timer = 0;
	self.toRemove = false;
	var super_update = self.update;
	self.update = function(){
		if(self.timer++ > 100){
			self.toRemove = true;
		}
		for(var i in Player.list){
			var p = Player.list[i];
			if(self.getDistance(p) < 32 && self.parent !== p.id){
				self.toRemove = true;
			}
		}
		super_update();
	}
	Ball.list[self.id] = self;
	initPack.ball.push({
		id:self.id,
		x:self.x,
		y:self.y
	});
	return self;
}

Ball.list = {};

Ball.update = function(){
	var pack = [];
	for(var i in Ball.list){
		var ball = Ball.list[i];
		ball.update();
		if(ball.toRemove){
			delete Ball.list[i];
			removePack.ball.push(ball.id);
		}
		pack.push({
			id:ball.id,
			x:ball.x,
			y:ball.y
		});
	}
	return pack;
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
	socket.id = Math.random();
	SOCKET_LIST[socket.id] = socket;
	Player.onConnect(socket);
	
	socket.on('disconnect', function(){
		delete SOCKET_LIST[socket.id];
		Player.onDisconnect(socket);
	});
});

var initPack = {player:[], ball:[]};
var removePack = {player:[], ball:[]};

setInterval(function(){
	var pack = {
		player:Player.update(),
		ball:Ball.update(),
	}
	for(var i in SOCKET_LIST){
		var socket = SOCKET_LIST[i];
		socket.emit('init', initPack);
		socket.emit('update', pack);
		socket.emit('remove', removePack);
	}
}, 1000/25);