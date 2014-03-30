/*  
CALL ASKME with request in url or POST method
http://127.0.0.1:8080/sarah/askme?request={....}

** REQUEST JSON STRUCTURE:
{
	"question":				"MY QUESTION",
	"answer":				["TEXT_ANSWER_1","TEXT_ANSWER_2","TEXT_ANSWER_..."],
	"answervalue":			["URL_ACTION_1","URL_ACTION_2","URL_ACTION_...],
	"answercallback":		[false,true,...],														//if transmit callback from action is needed
	"TTSanswer":			["TTS_ANSWER_1","","TTS_ANSWER_..."],									// TTS Speech with answer 
	"no_answervalue": 		INTEGER (URL_ACTION's number) OR STRING (url),							// Default action if no answer from user
	"timeout": 				INTEGER_TIMEOUT_IN_SECOND,												// waiting for an answer until timeout 
	"recall": 				true/false,																// if no answer, save request in file to 'askme' again later?
	"callback_immediatly": 	true/false																// callback immediatly - disabled  answercallback. (needed if long timeout)
 }
 
** DEFAULT VALUE: 
recall = true, timeout=20, answercallback=true

** EXEMPLE:
// http://127.0.0.1:8080/sarah/askme?request={%22question%22:%22veux+tu+que+l%27on+discute%3f%22,%22answer%22:[%22Oui%20merci%22,%20%22Non%20merci%22],%22answervalue%22:[%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+ne+sais+pas+de+quoi+parler!%22,%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+me+tais!%22],"timeout":10,"recall":false}
// http://127.0.0.1:8080/sarah/askme?request={%22question%22:%22veux+tu+que+l%27on+chante%3f%22,%22answer%22:[%22Oui%20merci%22,%20%22Non%20merci%22],%22answervalue%22:[%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+ne+sais+pas+chanter!%22,%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+me+tais!%22]}

** POST EXEMPLE CODE:
	var json={"request":{}};
    json.request.question="Bonjour comment allez vous?";
	json.request.answer=["ça va bien","ça ne vas pas fort!","tais toi!"];
	json.request.TTSanswer=["Cool"];
	json.request.answervalue=["http://127.0.0.1:8080/sarah/askme?test=tu as dis oui","http://127.0.0.1:8080/sarah/askme?test=tu as dis NON",""];
	json.request.no_answervalue="http://127.0.0.1:8080/sarah/askme?test=Je suppose que ça doit aller!";
	json.request.recall=false;
	json.request.timeout=10;
	json.request.callback_immediatly= false;
	var url='http://127.0.0.1:8080/sarah/askme';
	var request = require('request');
    request({ 
			'uri': url,
            'method': 'POST',
            'json': json,
			'timeout': 5000,
			}, function (err, response, body){
				if (err || response.statusCode != 200) {
					callback({'tts':'error'});
					return;
					}	
			callback({'tts':'ok'});
			});
*/

// CONFIGURATION
var debug=true;
var default_timeout=10;				// DEFAULT TIMEOUT VALUE (seconds)
var default_recall=true;			// DEFAULT RECALL VALUE (true: save question in JSON file)
var default_answercallback=true;	// DEFAULT ANSWERCALLBACK VALUE (false: no callback from action url)
var clear_json_on_init=true;		// false to not clear all questions in json when nodejs restart

// INITIALISATION
exports.init = function(SARAH){
	if (clear_json_on_init==true) {clearjson();}			
}

//EXPORTS.ACTION
exports.action = function (data, callback, config, SARAH) {

	// QUESTION FROM URL HTTP
	if ((typeof(data.request)!="undefined")||(typeof(data.body.request)!="undefined")) {
		// Check URL/POST
			var request={};
			if (typeof(data.request)!="undefined") {request=JSON.parse(data.request);}			// Json from request in url
			else if (typeof(data.body.request)!="undefined") {request=data.body.request; }		// Json from request in POST
			else {console.log ('plugin AskMe : No Request in URL or POST'); callback({'tts':'ERROR'}); return;}
		// CHECK if request is correct => ERROR
			if (checkrequest(request,callback)==false) {return;} ;		
		// DEFAULT VALUE
			if (typeof(request.timeout)!="number") {request.timeout=default_timeout;} 		
			if (typeof(request.recall)!="boolean") {request.recall=default_recall;} 	
			if (typeof(request.answercallback)=="undefined") {
				request.answercallback=[];
				for (var i = 0; i <request.answer.length; i++) 
					{request.answercallback[i]=default_answercallback;} 	
			}
		createquestion(request,true,SARAH);
	} 
	
	// REPEAT QUESTION FROM SARAH
	else if (typeof(data.repeat)!="undefined")  {
		request=lastrequestfromjson();			
		if (request!=false)	
			{
			removetojson(); 
			createquestion(request,false,SARAH);
			}
		else 
			{callback({'tts':'Je n\'ai pas de question en attente'});}
	}

	// *************************
	// ONLY FOR TEST PLUGIN
	 else if (typeof(data.test)!="undefined") {SARAH.speak(data.test); callback({'body':{'tts':'reponse de test'}});}
	// *************************

	else callback();
	
	function createquestion (my_request,newone,SARAH) {
		console.log("plugin askme - Nouvelle requète:" + my_request.question);
		my_question=my_request.question;
		my_reponses={};
		my_timeout=my_request.timeout*1000;
		for (var i = 0; i < my_request.answer.length; i++) {my_reponses[my_request.answer[i]]=i;}
		if (my_request.callback_immediatly) callback();
		SARAH.askme(my_question, my_reponses, my_timeout, function(answer, end){ // the selected answer or false
			// No answer
			if (answer===false) {
				console.log('plugin askme - Aucune réponse donnée');
				if (my_request.recall==true)  { addtojson(my_request,true);}
				if (my_request.no_answervalue) {			// IF No ANSWER -> ACTION
					console.log('plugin askme - Action lancée sur absence de réponse');
					// Send Request
					var request = require('request');
					request({ 'uri' : my_request.no_answervalue }, function (err, response, body){
						if (err || response.statusCode != 200) {
							console.log("L'action a échouée:"+err+" - "+response.statusCode);
							callback({'tts': "L'action a échoué"});
							return;
						}
						console.log('plugin askme - Send effectué: '+my_request.no_answervalue);
						callback();
					});
				}
				else {callback();}
				end();
			}
			// Answer
			else 	{
				console.log('plugin askme - réponse donnée:'+my_request.answer[answer]);
				// tts on answer
				if ((typeof(my_request.TTSanswer)!='undefined')&&(typeof(my_request.TTSanswer[answer])!='undefined')&&(my_request.TTSanswer[answer]!="")) {SARAH.speak(my_request.TTSanswer[answer])}
				if (my_request.answervalue[answer]!='') {
					// Send Request
					console.log('plugin askme - Action lancée sur réponse');
					var request = require('request');
					request({ 'uri' : my_request.answervalue[answer] }, function (err, response, body){
						if (err || response.statusCode != 200) {
							console.log("L'action a échouée:"+err+" - "+response.statusCode);
							callback({'tts': "L'action a échoué"});
							return;
						}
						console.log('plugin askme - Send effectué: '+my_request.answervalue[answer]);
						if (!(my_request.callback_immediatly))
							{if (my_request.answercallback[answer]=='true') {callback({'tts':response.body});} else {callback();}}
					});
				}
				end();
				// See to another question in json
				setTimeout(function(){				
					request=lastrequestfromjson();			
					if (request!=false)	{
						SARAH.run('askme', { 'repeat' : 1  , "body":''});
						} 
				}, 2000);
			}
		});
	}
	
}

function addtojson(request,newone){
	var fs = require('fs');
	var fileJSON = 'plugins/askme/askme.json';
	// Create new request with data in order:
	var newrequest={};
	newrequest.question=request.question;
	newrequest.answer=request.answer;
	newrequest.answervalue=request.answervalue;
	newrequest.answercallback=request.answercallback;
	newrequest.TTSanswer=request.TTSanswer;
	newrequest.no_answervalue=request.no_answervalue;
	newrequest.timeout=request.timeout;
	newrequest.recall=request.recall;
	if (fs.existsSync(fileJSON)) {json = JSON.parse(fs.readFileSync(fileJSON,'utf8'));}
	// CHECK if request already exist.
	for (var i = 0; i < json.AllRequest.length; i++) {
		if (JSON.stringify(json.AllRequest[i].request)==JSON.stringify(newrequest)) {
			if (debug==true) {console.log("Plugin ASKME - Suppression dans le json d'une request déjà existante.");}
			json.AllRequest.splice(i,1); 			// Delete existing request
			break;
		}
	}
	if (newone)	
		{json.AllRequest.unshift({"request":newrequest});}
	else		
		{json.AllRequest.push({"request":newrequest});}
	fs.writeFileSync(fileJSON, JSON.stringify(json, null, 4) , 'utf8');
	if (debug==true) {console.log('plugin askme - JSON mis à jour!');}
} 

function lastrequestfromjson(){						// GIVE LAST QUESTION FROM JSON
	var fs = require('fs');
	var fileJSON = 'plugins/askme/askme.json';
	if (fs.existsSync(fileJSON)) {json = JSON.parse(fs.readFileSync(fileJSON,'utf8'));}
	if (json.AllRequest.length>0) {	return json.AllRequest[0].request;}	else{return false;}
} 

function removetojson(){ 							//REMOVE OLDEST QUESTION IN JSON
	var fs = require('fs');
	var fileJSON = 'plugins/askme/askme.json';
	json = JSON.parse(fs.readFileSync(fileJSON,'utf8'));
	json.AllRequest.shift();
	fs.writeFileSync(fileJSON, JSON.stringify(json, null, 4), 'utf8');
	if (debug==true) {console.log('plugin askme - JSON mis à jour!');}
} 

function clearjson(){								// CLEAR JSON
	var fs = require('fs');
	var fileJSON = 'plugins/askme/askme.json';
	var json={"AllRequest":[]};
	fs.writeFileSync(fileJSON, JSON.stringify(json), 'utf8');
	if (debug==true) {console.log('plugin askme - JSON vidé!');}
} 

function checkrequest(request,callback) {
	// CHECK NEEDED DATA
	if (typeof(request.question)=="undefined") {callback({"tts":"ERROR"}); console.log ('plugin AskMe : question is missing'); return false;}
	if (typeof(request.answer)=="undefined") {callback({"tts":"ERROR"}); console.log ('plugin AskMe : Answer is missing'); return false;}
	if (typeof(request.answervalue)=="undefined") {callback({"tts":"ERROR"}); console.log ('plugin AskMe : Answervalue is missing'); return false;}
	// CHECK question
	if (typeof(request.question)!="string") {callback({"tts":"ERROR"}); console.log ('plugin AskMe : question is not STRING'); return false;}
	// CHECK answer/answervalue : OBJECT & Size & Url?
	if ((typeof(request.answer)!="object") || (typeof(request.answervalue)!="object")) {callback({"tts":"ERROR"}); console.log ('plugin AskMe : Answer or Answervalue is not OBJECT'); return false;}
	if (request.answer.length!=request.answervalue.length) {callback({"tts":"ERROR"}); console.log ('plugin AskMe : nb Answer <> nb Answervalue'); return false;}
	if (request.answer.length==0) {callback({"tts":"ERROR"}); console.log ('plugin AskMe : Answer or Answervalue Empty'); return false;}
	if ((typeof(request.answercallback)=="object") &&  (request.answercallback.length!=request.answervalue.length)) {callback({"tts":"ERROR"}); console.log ('plugin AskMe : nb Answercallback <> nb Answer'); return false;}
	if ((typeof(request.answercallback)!="object")&&(typeof(request.answercallback)!="undefined")) {callback({"tts":"ERROR"}); console.log ('plugin AskMe : Answercallback is not OBJECT'); return false;}
	if ((typeof(request.TTSanswer)!="object")&&(typeof(request.TTSanswer)!="undefined")) {callback({"tts":"ERROR"}); console.log ('plugin AskMe : TTSanswer is not OBJECT'); return false;}
	var urlregex = new RegExp("^(http:\/\/|https:\/\/)");
	for (var i = 0; i < request.answervalue.length; i++) {
		if (request.answervalue[i]!="") {
			if (!(urlregex.test(request.answervalue[i]))) { callback({"tts":"ERROR"}); 	console.log ("plugin Askme - AnswerValue "+i+" is not URL"); return false;}
			}
	}
	// CHECK no_answervalue: INTERGER / URL  (INTEGER -> URL) 
	if ((!(urlregex.test(request.no_answervalue))) && (typeof(request.no_answervalue)!="number") && (typeof(request.no_answervalue)!="undefined")) { callback({"tts":"ERROR"}); 	console.log ("plugin Askme - no_AnswerValue is not URL"); return false;} 
	if (typeof(request.no_answervalue)=="number") {
		if ((parseFloat(request.no_answervalue) == parseInt(request.no_answervalue)) && !isNaN(request.no_answervalue)){ // integer ? 
			var no_answervalue_number=request.no_answervalue-1;
			if ((no_answervalue_number<=request.answervalue.length) && (no_answervalue_number>=0)) {
				delete request.no_answervalue;
				request.no_answervalue=request.answervalue[no_answervalue_number];
			}
			else { callback({"tts":"ERROR"}); 	console.log ("plugin Askme - no_AnswerValue is out of range"); return false;}
		}
		else { callback({"tts":"ERROR"}); 	console.log ("plugin Askme - no_AnswerValue is not INTEGER"); return false;}
	}
	return true
}
