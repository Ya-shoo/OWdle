// Hand-curated pre-match / interaction conversations between OW heroes.
// Each conversation has exactly two speakers (referenced by OverFast hero key)
// and an array of dialogue lines tagged with which speaker is talking.
//
// Curation rule: lines should NOT contain the other speaker's first name,
// real name, or other obvious identifier — those would spoil the puzzle.
// When in doubt, paraphrase to remove the spoiler.

export type ConversationLine = {
  // 0 = first speaker, 1 = second speaker.
  speaker: 0 | 1;
  text: string;
};

export type Conversation = {
  speakers: [string, string]; // hero keys; index matches `speaker` on each line
  context?: string; // optional setting label, e.g., "Watchpoint: Gibraltar"
  lines: ConversationLine[];
};

export const CONVERSATIONS: Conversation[] = [
  {
    speakers: ["brigitte", "reinhardt"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Do not worry, master. I am at your side." },
      { speaker: 1, text: "Excellent! With you here, I cannot fail!" },
      {
        speaker: 0,
        text: "Just promise me you'll wait for cover before charging in.",
      },
      { speaker: 1, text: "Bah! Where is your sense of glory?" },
      {
        speaker: 0,
        text: "Glory does not patch armor or set bones, master.",
      },
      { speaker: 1, text: "Then it is good I have my squire to do both!" },
    ],
  },
  {
    speakers: ["tracer", "widowmaker"],
    context: "Paris",
    lines: [
      {
        speaker: 0,
        text: "I'd love to live in Paris one day. Lots of tourists, get to see the Eiffel Tower up close.",
      },
      { speaker: 1, text: "How charming." },
      {
        speaker: 0,
        text: "You can be a real downer sometimes, you know that?",
      },
      { speaker: 1, text: "And yet, here you are, still talking." },
      { speaker: 0, text: "I don't get it. We could be friends, you and me." },
      { speaker: 1, text: "I doubt that very much." },
    ],
  },
  {
    speakers: ["dva", "genji"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "I think we have a lot in common — we're both gamers!",
      },
      {
        speaker: 1,
        text: "I am uncertain that the term applies to me, but I appreciate the sentiment.",
      },
      {
        speaker: 0,
        text: "Aw, don't be modest. You'd top the leaderboards for sure.",
      },
      {
        speaker: 1,
        text: "Perhaps. Though my reflexes were not earned in front of a screen.",
      },
      {
        speaker: 0,
        text: "Reflexes are reflexes! Bet you'd be cracked at platformers.",
      },
      { speaker: 1, text: "I shall take that as a compliment." },
    ],
  },
  {
    speakers: ["cassidy", "reaper"],
    context: "Route 66",
    lines: [
      { speaker: 0, text: "I never thought I'd see you again, boss." },
      { speaker: 1, text: "Don't get sentimental on me." },
      {
        speaker: 0,
        text: "Wouldn't dream of it. You always did hate the fuss.",
      },
      { speaker: 1, text: "Then keep walking." },
      {
        speaker: 0,
        text: "The others wonder if there's anything left of you in there.",
      },
      { speaker: 1, text: "Let them wonder." },
    ],
  },
  {
    speakers: ["ana", "soldier-76"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Old soldiers never die..." },
      { speaker: 1, text: "...and they don't fade away." },
      { speaker: 0, text: "We've still got fight left in us, then." },
      { speaker: 1, text: "More than they bargained for." },
      {
        speaker: 0,
        text: "It would be nice to retire, one of these days.",
      },
      { speaker: 1, text: "We earned it. Doesn't mean we'll get it." },
    ],
  },
  {
    speakers: ["junkrat", "roadhog"],
    context: "Junkertown",
    lines: [
      {
        speaker: 0,
        text: "Today's the day, mate. We're gonna be famous!",
      },
      { speaker: 1, text: "Loud and dumb." },
      {
        speaker: 0,
        text: "Oi! That's loud and brilliant, thank you very much.",
      },
      { speaker: 1, text: "Hmph." },
      {
        speaker: 0,
        text: "I've got a plan this time. Real solid, this one.",
      },
      { speaker: 1, text: "You said that last time." },
      { speaker: 0, text: "And it worked, didn't it?" },
      { speaker: 1, text: "We're still alive. Barely." },
    ],
  },
  {
    speakers: ["zenyatta", "genji"],
    context: "Nepal",
    lines: [
      { speaker: 0, text: "Are you at peace, my student?" },
      { speaker: 1, text: "I am at peace." },
      {
        speaker: 0,
        text: "Then walk into battle without fear. Your discipline is your shield.",
      },
      { speaker: 1, text: "I walk because you taught me how, master." },
      {
        speaker: 0,
        text: "And one day, you shall walk without me. That is the way of things.",
      },
      { speaker: 1, text: "Not today, I hope." },
      { speaker: 0, text: "No. Not today." },
    ],
  },
  {
    speakers: ["mercy", "genji"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "I am still uncomfortable with what I had to do to save your life.",
      },
      {
        speaker: 1,
        text: "Do not be. You gave me a chance to find peace.",
      },
      {
        speaker: 0,
        text: "I hope, in time, you have truly found it.",
      },
      { speaker: 1, text: "Each day, a little closer." },
      {
        speaker: 0,
        text: "If anything ever troubles you — the body, the changes — promise me you'll come.",
      },
      {
        speaker: 1,
        text: "I promise. But you have already done more than enough.",
      },
      { speaker: 0, text: "It will never feel like enough." },
    ],
  },
  {
    speakers: ["lucio", "dva"],
    context: "Busan",
    lines: [
      { speaker: 0, text: "Wanna race?" },
      { speaker: 1, text: "Sure, but I'm gonna win!" },
      {
        speaker: 0,
        text: "Ha! Let's see what that mech of yours can really do.",
      },
      { speaker: 1, text: "Loser buys snacks?" },
      { speaker: 0, text: "Deal. Hope you brought your wallet." },
      { speaker: 1, text: "Hope you brought your A-game." },
      { speaker: 0, text: "Always do, kid." },
    ],
  },
  {
    speakers: ["mercy", "reaper"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "What you have become is monstrous. We were never meant to live like this.",
      },
      { speaker: 1, text: "And whose fault is that?" },
      { speaker: 0, text: "I tried to save you. I am still trying." },
      { speaker: 1, text: "Some things cannot be saved." },
      { speaker: 0, text: "I refuse to believe that." },
      { speaker: 1, text: "Then you are still a fool." },
      { speaker: 0, text: "If hope makes me a fool, so be it." },
    ],
  },
  {
    speakers: ["soldier-76", "reaper"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "I should have left you in the desert." },
      { speaker: 1, text: "Old habits die hard." },
      { speaker: 0, text: "Yeah. So do you, apparently." },
      { speaker: 1, text: "We're not so different anymore." },
      { speaker: 0, text: "Don't compare us." },
      {
        speaker: 1,
        text: "Why not? We both wear masks. We both can't let go.",
      },
      {
        speaker: 0,
        text: "I'm doing this to fix things. You're doing it for revenge.",
      },
      { speaker: 1, text: "Are you so sure those are different?" },
    ],
  },
  {
    speakers: ["tracer", "reaper"],
    context: "King's Row",
    lines: [
      { speaker: 0, text: "Long time, no see, luv. How've you been?" },
      { speaker: 1, text: "Not as long as I'd hoped." },
      { speaker: 0, text: "Aw, don't be such a grump. I missed you too." },
      { speaker: 1, text: "The feeling is not mutual." },
      { speaker: 0, text: "Ouch. Tough crowd today." },
      { speaker: 1, text: "Every day." },
      { speaker: 0, text: "Well, smile for the cameras, eh?" },
    ],
  },
  {
    speakers: ["torbjorn", "bastion"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "I knew it would be impossible to keep you out of trouble.",
      },
      { speaker: 1, text: "Beep boop boop boop." },
      {
        speaker: 0,
        text: "Yes, yes — easy for you to say. You don't have to file the paperwork.",
      },
      { speaker: 1, text: "Dwooo weee?" },
      {
        speaker: 0,
        text: "Don't give me that look. You know exactly what you did.",
      },
      { speaker: 1, text: "Bweeeeep." },
      { speaker: 0, text: "Hmph. Apology accepted. This time." },
    ],
  },
  {
    speakers: ["winston", "tracer"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Are you sure you're up for this?" },
      { speaker: 1, text: "Cheers, love. The cavalry's here." },
      { speaker: 0, text: "That's what I was afraid of." },
      { speaker: 1, text: "Oi! Have a little faith, big guy!" },
      { speaker: 0, text: "I have faith. I'm just out of antacids." },
      { speaker: 1, text: "You worry too much. We've got this." },
      { speaker: 0, text: "Famous last words." },
    ],
  },
  {
    speakers: ["sombra", "widowmaker"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "How are you, hermana? Still icy as ever?" },
      { speaker: 1, text: "Don't be so familiar with me." },
      {
        speaker: 0,
        text: "Aw, no fun. We're partners — we should bond a little.",
      },
      { speaker: 1, text: "I prefer silence." },
      {
        speaker: 0,
        text: "You always say that. Deep down, I think you enjoy the company.",
      },
      { speaker: 1, text: "Deep down, I do not feel anything at all." },
      { speaker: 0, text: "Mm. Keep telling yourself that." },
    ],
  },
  {
    speakers: ["cassidy", "ashe"],
    context: "Route 66",
    lines: [
      { speaker: 0, text: "Hey there, partner. It's been a while." },
      { speaker: 1, text: "Not long enough." },
      { speaker: 0, text: "Now is that any way to greet an old friend?" },
      { speaker: 1, text: "We were never friends." },
      {
        speaker: 0,
        text: "We rode together. That's gotta count for something.",
      },
      {
        speaker: 1,
        text: "It counts as a mistake I'm not making twice.",
      },
      { speaker: 0, text: "Suit yourself. Just don't shoot me in the back." },
      { speaker: 1, text: "I'd shoot you in the front. I've got standards." },
    ],
  },
  {
    speakers: ["mei", "winston"],
    context: "Antarctica",
    lines: [
      {
        speaker: 0,
        text: "I never thought I would see another familiar face again.",
      },
      { speaker: 1, text: "I'm glad we're still around." },
      {
        speaker: 0,
        text: "Me too. The world feels less lonely with allies in it.",
      },
      { speaker: 1, text: "Then let's make sure it stays that way." },
      { speaker: 0, text: "Do you ever miss the lab?" },
      {
        speaker: 1,
        text: "Every day. But the work continues — just somewhere new.",
      },
      { speaker: 0, text: "Yes. That is what they would have wanted." },
    ],
  },
  {
    speakers: ["pharah", "ana"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "I always knew you were watching over me." },
      { speaker: 1, text: "I'm sorry I had to be away for so long." },
      { speaker: 0, text: "You're here now. That's what matters." },
      {
        speaker: 1,
        text: "Stay close, my dear. Let me make up for lost time.",
      },
      {
        speaker: 0,
        text: "I'm not a child anymore. I can take care of myself.",
      },
      {
        speaker: 1,
        text: "I know. That doesn't stop a mother from worrying.",
      },
      { speaker: 0, text: "Then watch. I'll show you what I've become." },
    ],
  },
  {
    speakers: ["kiriko", "genji"],
    context: "Hanamura",
    lines: [
      { speaker: 0, text: "It's good to be back home." },
      { speaker: 1, text: "Yes. Even after all this time." },
      { speaker: 0, text: "The shrine has missed your footsteps." },
      {
        speaker: 1,
        text: "Then I shall make sure it hears them more often.",
      },
      {
        speaker: 0,
        text: "My grandmother used to say you would return one day.",
      },
      { speaker: 1, text: "She always was wiser than me." },
      { speaker: 0, text: "She said that too." },
    ],
  },
  {
    speakers: ["zarya", "sigma"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "I have heard of your work. They say you have a great mind.",
      },
      {
        speaker: 1,
        text: "Who can say what greatness truly is?",
      },
      {
        speaker: 0,
        text: "A philosopher in armor. Try to keep up with my pace, then.",
      },
      {
        speaker: 1,
        text: "The universe is full of surprises. Perhaps I shall be one for you.",
      },
      { speaker: 0, text: "I welcome the challenge." },
      {
        speaker: 1,
        text: "And I welcome a worthy companion in battle.",
      },
    ],
  },
  {
    speakers: ["hanzo", "genji"],
    context: "Hanamura",
    lines: [
      {
        speaker: 0,
        text: "I had heard you were here. I was hoping it was a lie.",
      },
      { speaker: 1, text: "And yet, here I am. Time changes us all." },
      { speaker: 0, text: "Some changes cannot be forgiven." },
      {
        speaker: 1,
        text: "I did not come here for your forgiveness.",
      },
      { speaker: 0, text: "Then why have you come?" },
      {
        speaker: 1,
        text: "To prove that you do not have to walk this path alone.",
      },
      { speaker: 0, text: "I always have." },
    ],
  },
  {
    speakers: ["reinhardt", "torbjorn"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "You old goat! Are you ready to fight by my side once more?",
      },
      { speaker: 1, text: "I'm too old for this. So are you." },
      { speaker: 0, text: "Nonsense! We are in our prime!" },
      { speaker: 1, text: "Bah. You always say that." },
      { speaker: 0, text: "And I am always right!" },
      {
        speaker: 1,
        text: "Just don't break anything. I can't keep up with the repairs.",
      },
    ],
  },
  {
    speakers: ["reinhardt", "ana"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "It is good to fight beside you again, my dear friend.",
      },
      {
        speaker: 1,
        text: "It is good to see you still standing, you old lion.",
      },
      { speaker: 0, text: "I will fight until I cannot lift my hammer!" },
      {
        speaker: 1,
        text: "I have no doubt. Just try to keep your head down once in a while.",
      },
      { speaker: 0, text: "Ha! Where would be the glory in that?" },
    ],
  },
  {
    speakers: ["pharah", "reinhardt"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "It has been too long since I have stood beside you.",
      },
      {
        speaker: 1,
        text: "You have grown into a fine warrior. Your father would be proud.",
      },
      {
        speaker: 0,
        text: "He would be prouder still to see you in the field again.",
      },
      {
        speaker: 1,
        text: "Then let us give him something to be proud of.",
      },
      { speaker: 0, text: "After you, old friend." },
    ],
  },
  {
    speakers: ["mercy", "pharah"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "Try not to take any unnecessary risks out there.",
      },
      { speaker: 1, text: "I make no promises. The mission comes first." },
      {
        speaker: 0,
        text: "Then I will be right behind you, as always.",
      },
      { speaker: 1, text: "I never doubted it." },
      {
        speaker: 0,
        text: "Stay close. I cannot heal what I cannot reach.",
      },
    ],
  },
  {
    speakers: ["brigitte", "torbjorn"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "How are the new specs holding up?" },
      { speaker: 1, text: "Built to last. Just like you, my girl." },
      { speaker: 0, text: "I'll bring it back in one piece." },
      {
        speaker: 1,
        text: "Bring yourself back in one piece. The armor I can fix.",
      },
      { speaker: 0, text: "I always do." },
    ],
  },
  {
    speakers: ["wrecking-ball", "winston"],
    context: "Horizon Lunar Colony",
    lines: [
      {
        speaker: 0,
        text: "I never thought I would see another familiar face from home.",
      },
      { speaker: 1, text: "Nor I. But here we both are." },
      { speaker: 0, text: "Have you been... well?" },
      {
        speaker: 1,
        text: "I have adapted. As have you, by the look of things.",
      },
      { speaker: 0, text: "We had no other choice." },
    ],
  },
  {
    speakers: ["echo", "genji"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "We are both more than what we once were." },
      { speaker: 1, text: "And less, in some ways." },
      { speaker: 0, text: "Yes. But it is enough." },
    ],
  },
  {
    speakers: ["moira", "mercy"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Still clinging to the old ideals, I see." },
      { speaker: 1, text: "And you are still chasing answers in the dark." },
      { speaker: 0, text: "The dark is where progress is made." },
      {
        speaker: 1,
        text: "Progress without principles is only destruction.",
      },
      {
        speaker: 0,
        text: "And idealism without results is merely vanity.",
      },
    ],
  },
  {
    speakers: ["moira", "reaper"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "How is the condition today?" },
      { speaker: 1, text: "Manageable. For now." },
      {
        speaker: 0,
        text: "We will find a permanent solution. In time.",
      },
      { speaker: 1, text: "Time is something I no longer have." },
    ],
  },
  {
    speakers: ["doomfist", "sombra"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Are your assets in place?" },
      { speaker: 1, text: "Always, jefe. You worry too much." },
      { speaker: 0, text: "I do not worry. I plan." },
    ],
  },
  {
    speakers: ["mauga", "baptiste"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Hah! Just like the old days, eh?" },
      {
        speaker: 1,
        text: "These are not the old days. We are not the same people.",
      },
      {
        speaker: 0,
        text: "Speak for yourself! I have not changed a bit.",
      },
      { speaker: 1, text: "That is the problem." },
      { speaker: 0, text: "You worry too much. Always have." },
    ],
  },
  {
    speakers: ["sojourn", "soldier-76"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "Captain. It's good to be in the field with you again.",
      },
      { speaker: 1, text: "Don't call me that. Those days are gone." },
      { speaker: 0, text: "Old habits." },
      { speaker: 1, text: "Yeah. We've all got those." },
    ],
  },
  {
    speakers: ["cassidy", "soldier-76"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Long time, partner." },
      { speaker: 1, text: "We were never partners." },
      {
        speaker: 0,
        text: "Aw, don't be like that. We were on the same side once.",
      },
      { speaker: 1, text: "And then you walked off the team." },
      { speaker: 0, text: "Yeah, well. I had my reasons." },
    ],
  },
  {
    speakers: ["ramattra", "zenyatta"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "You walk a path that leads only to destruction.",
      },
      {
        speaker: 1,
        text: "I walk the path I must. One day, you will see why.",
      },
      { speaker: 0, text: "I see only suffering at its end." },
      {
        speaker: 1,
        text: "Then perhaps you should walk it with me.",
      },
      { speaker: 0, text: "I cannot." },
    ],
  },
  {
    speakers: ["junker-queen", "roadhog"],
    context: "Junkertown",
    lines: [
      {
        speaker: 0,
        text: "Look who's slunk back home. The traitor returns.",
      },
      { speaker: 1, text: "Not back. Just passing through." },
      {
        speaker: 0,
        text: "You'd best keep moving, then. The throne's not waiting for you.",
      },
      { speaker: 1, text: "Never wanted it." },
    ],
  },
  {
    speakers: ["hanzo", "cassidy"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "Of all the people to find on this side." },
      { speaker: 1, text: "Don't tell me you came for the bounty." },
      { speaker: 0, text: "Only if you make it interesting." },
    ],
  },
  {
    speakers: ["junker-queen", "junkrat"],
    context: "Junkertown",
    lines: [
      {
        speaker: 0,
        text: "Should've kept your scrappy little behind out of my city.",
      },
      { speaker: 1, text: "Aw, did ya miss me, your majesty?" },
      { speaker: 0, text: "I missed having a target for practice." },
      {
        speaker: 1,
        text: "Oi! That's a hurtful thing to say to a celebrity!",
      },
    ],
  },
  {
    speakers: ["lifeweaver", "symmetra"],
    context: "Pre-match",
    lines: [
      {
        speaker: 0,
        text: "It seems we are still on opposite sides of the garden.",
      },
      {
        speaker: 1,
        text: "There is order to be made. You see chaos, I see possibility.",
      },
      {
        speaker: 0,
        text: "And yet your possibilities always come with chains.",
      },
      { speaker: 1, text: "Order is not a chain. It is a foundation." },
    ],
  },
  {
    speakers: ["mei", "sigma"],
    context: "Pre-match",
    lines: [
      { speaker: 0, text: "I have read your work. It was beautiful." },
      { speaker: 1, text: "Was. Yes, I suppose it was." },
      {
        speaker: 0,
        text: "It can be again. Knowledge is never lost.",
      },
      { speaker: 1, text: "You are kinder than the universe deserves." },
    ],
  },
];
