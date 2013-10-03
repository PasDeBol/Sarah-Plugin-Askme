/*  
CALL ASKME with request in url or POST method
http://127.0.0.1:8080/sarah/askme?request={....}

** REQUEST JSON STRUCTURE:
{
	"question":			"MY QUESTION",
	"answer":			["TEXT_ANSWER_1","TEXT_ANSWER_2","TEXT_ANSWER_..."],
	"answervalue":		["URL_ACTION_1","URL_ACTION_2","URL_ACTION_...],
	"answercallback":	[false,true,...],														//if transmit callback from action is needed
	"TTSanswer":		["TTS_ANSWER_1","","TTS_ANSWER_..."],									// TTS Speech with answer 
	"no_answervalue": 	INTEGER (URL_ACTION's number) OR STRING (url),							// Default action if no answer from user
	"timeout": 			INTEGER_TIMEOUT_IN_SECOND,												// waiting for an answer until timeout 
	"recall": 			true/false																// if no answer, save request in file to 'askme' again later?
 }
 
** DEFAULT VALUE: 
recall = true, timeout=20, answercallback=true

** EXEMPLE:
// http://127.0.0.1:8080/sarah/askme?request={%22question%22:%22veux+tu+que+l%27on+discute%3f%22,%22answer%22:[%22Oui%20merci%22,%20%22Non%20merci%22],%22answervalue%22:[%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+ne+sais+pas+de+quoi+parler!%22,%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+me+tais!%22],"timeout":10,"recall":false}
// http://127.0.0.1:8080/sarah/askme?request={%22question%22:%22veux+tu+que+l%27on+chante%3f%22,%22answer%22:[%22Oui%20merci%22,%20%22Non%20merci%22],%22answervalue%22:[%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+ne+sais+pas+chanter!%22,%22http%3a%2f%2f127.0.0.1%3a8080%2fsarah%2faskme%3ftest%3dje+me+tais!%22]}

** POST EXEMPLE CODE:
 	var json={"request":{}};
    json.request.question="Bonjour comment allez vous?";
	json.request.answer=["ça va bien","ça ne vas pas fort!"];
	json.request.answervalue=["http://127.0.0.1:8080/sarah/askme?test=tu as dis oui",""];
	json.request.recall=false;
	json.request.timeout=10;
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
var default_timeout=20;				// DEFAULT TIMEOUT VALUE (seconds)
var default_recall=true;			// DEFAULT RECALL VALUE (true: save question in JSON file)
var default_answercallback=true;	// DEFAULT ANSWERCALLBACK VALUE (false: no callback from action url)
var clear_json_on_init=true;		// false to not clear all questions in json when nodejs restart

// INITIALISATION
exports.init = function(SARAH){
	SARAH.context.askme=-1	// SARAH.context.askme: (timeout :decrease value) -1=ready 0=End with answer, 1=No Answer, >1 waiting answer 
	deletexmldata();
	if (clear_json_on_init==true) {clearjson();}			
}

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
		// Process Request		
			if (SARAH.context.askme==-1) {createquestion(request,true);}						// ASK Question Now
			else {addtojson(request,false);}													// ASK Question later (add to json)
			callback();
	} 


// ANSWER FROM SARAH
	else if ((typeof(data.reponse)!="undefined")&&(SARAH.context.askme>1)) {
		// Reset timout
		SARAH.context.askme=0;
		// Delete Data XML
		deletexmldata ();
		// Supprime la dernier request du json
		removetojson();
		if (data.reponse!="") {
			// Send Request
				var request = require('request');
				request({ 'uri' : data.reponse }, function (err, response, body){
					if (err || response.statusCode != 200) {
						console.log("L'action a échouée:"+err+" - "+response.statusCode);
						callback({'tts': "L'action a échoué"});
						return;
					}
					console.log('plugin askme - Send effectué: '+data.reponse);
					if (data.callback=='true') {callback({'tts':response.body});} else {callback();}
					setTimeout(function(){				
						// See to another question in json
						request=lastrequestfromjson();			
						if (request!=false)	{
							createquestion(request,false);
						} else {
							// Reset timout
							SARAH.context.askme=-1;
						}
					}, 2000);				
				});
		}
		else{
			console.log('plugin askme - Réponse reçue : sans action');
			// Reset timout
			SARAH.context.askme=-1;
			callback();
		}
	} 
// REPEAT QUESTION FROM SARAH
	else if (typeof(data.repeat)!="undefined")  {
		// See to another question in json
		request=lastrequestfromjson();			
			if (request!=false)	{
				if (SARAH.context.askme==-1) {				// Repeat Question and XML and start timeout
					createquestion(request,false);
					callback();
				}
				else{										// Repeat Question and timeout only
					SARAH.context.askme=parseInt(request.timeout);
					callback({'tts':request.question});
					}		
			}
			else {
				callback({'tts':'Je n\'ai pas de question en attente'});
			}
	}
// *************************
// ONLY FOR TEST PLUGIN
	else if (typeof(data.test)!="undefined") {SARAH.speak(data.test); callback();}
// *************************

	else callback();
	
	function createquestion (request,newone) {
		// Insert Data in XML
		writedataxml(request)
		// update Context from Timeout (seconds)
		SARAH.context.askme=parseInt(request.timeout);
		if (newone) {
			// Add question to json
			addtojson(request,true);
		}
		setTimeout(function(){
			// Question to Sarah
			SARAH.speak(request.question);
			console.log("plugin askme : En attente de  réponse ("+SARAH.context.askme+"s)");
			// LOOP to wait an answer 
			waitanswer(request.recall,request.no_answervalue);
		}, 1000);
	}

	function waitanswer(recall, no_answervalue) {
		if (SARAH.context.askme==1){
			SARAH.context.askme=0;
			console.log("plugin askme : Aucune réponse reçue!");
			deletexmldata();
			if (recall==false)  { removetojson();}
			if (no_answervalue) {			// IF No ANSWER -> ACTION
				// Send Request
				var request = require('request');
				request({ 'uri' : no_answervalue }, function (err, response, body){
					if (err || response.statusCode != 200) {
						console.log("L'action a échouée:"+err+" - "+response.statusCode);
						callback({'tts': "L'action a échoué"});
						return;
					}
					console.log('plugin askme - Send effectué: '+no_answervalue);
					
				});
			}
			
			setTimeout(function(){				
					// See to another question in json without recall only
					request=lastrequest_norecall_fromjson();			
					if (request!=false)	{
						createquestion(request,false);
					} else {
						// Reset timout
						SARAH.context.askme=-1;
					}
				}, 2000);	
		}
		else if (SARAH.context.askme>1){
			//(SARAH.context.xbmc.scrolling=='ON') {
			SARAH.context.askme=SARAH.context.askme-1;
			if (debug==true) {console.log("plugin askme : En attente de  réponse ("+SARAH.context.askme+")");}
			setTimeout(function(){waitanswer(recall,no_answervalue)}, 1000);
			}
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

function lastrequest_norecall_fromjson(){			// GIVE LAST QUESTION WITHOUT RECALL FROM JSON
	var fs = require('fs');
	var fileJSON = 'plugins/askme/askme.json';
	var request=false;
	if (fs.existsSync(fileJSON)) {json = JSON.parse(fs.readFileSync(fileJSON,'utf8'));}
	for (var i = 0; i < json.AllRequest.length; i++) {
		if (json.AllRequest[i].request.recall==false) {
			request=json.AllRequest[i].request;
			json.AllRequest.splice(i,1);
			json.AllRequest.unshift(request)
			fs.writeFileSync(fileJSON, JSON.stringify(json, null, 4) , 'utf8');
			break;
		}
	}
	return request;
} 

function removetojson(){ 							//REMOVE OLDEST QUESTION IN JSON
	var fs = require('fs');
	var fileJSON = 'plugins/askme/askme.json';
	json = JSON.parse(fs.readFileSync(fileJSON,'utf8'));
	json.AllRequest.shift();
	fs.writeFileSync(fileJSON, JSON.stringify(json, null, 4), 'utf8');
	if (debug==true) {console.log('plugin askme - JSON mis à jour!');}
} 

function writedataxml(request) { 					// WRITE AUTOMATIC DATA IN XML
	var fs = require('fs');
	var fileXML = 'plugins/askme/askme.xml';
	var xml = fs.readFileSync(fileXML, 'utf8');
	var replace='';
	console.log("plugin askme - Nouvelle requète:" + request.question);
	for (var i = 0; i < request.answer.length; i++) {
		if (request.answercallback[i]) {tag_callback='out.action.callback = "true";';} else {tag_callback='out.action.callback = "false";';}
		tag_TTSanswer="";
/*		if (typeof(request.TTSanswer)!='undefined') {
			if (typeof(request.TTSanswer[i])!='undefined') {tag_TTSanswer='out.action._attributes.tts ="'+request.TTSanswer[i].replace(/&/gi, "&amp;")+'";';}
		}
*/		if ((typeof(request.TTSanswer)!='undefined')&&(typeof(request.TTSanswer[i])!='undefined')) {tag_TTSanswer='out.action._attributes.tts ="'+request.TTSanswer[i].replace(/&/gi, "&amp;")+'";';}
		
		replace+='\n			<item>'+request.answer[i].replace(/&/gi, " et ")+'<tag>out.action.reponse = encodeURIComponent("' + request.answervalue[i].replace(/&/gi, "&amp;") + '");'+tag_callback+tag_TTSanswer+'</tag></item>';
		//console.log("plugin askme - "+request.answer[i]);
	}
	replace="§AUTOMATIC_XML_ASKME§ -->"+replace+"\n			<!-- END §AUTOMATIC_XML_ASKME§";
	var regexp = new RegExp('§AUTOMATIC_XML_ASKME§[^*]+§AUTOMATIC_XML_ASKME§', 'gm');
	var xml = xml.replace(regexp, replace);
	fs.writeFileSync(fileXML, xml, 'utf8');
	if (debug==true) {console.log('plugin askme - XML mis à jour!');}
}

function deletexmldata() { 							//DELETE AUTOMATIC DATA IN XML
	var fs = require('fs');
	var fileXML = 'plugins/askme/askme.xml';
	var xml = fs.readFileSync(fileXML, 'utf8');
	var replace = '§AUTOMATIC_XML_ASKME§ -->\n			<!-- END §AUTOMATIC_XML_ASKME§';
	var regexp = new RegExp('§AUTOMATIC_XML_ASKME§[^*]+§AUTOMATIC_XML_ASKME§', 'gm');
	var xml = xml.replace(regexp, replace);
	fs.writeFileSync(fileXML, xml, 'utf8');
	if (debug==true) {console.log('plugin askme - Data du XML effacées.');}

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
