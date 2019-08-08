# und
Multiprocess/Multiuser safe file storage. Un-database your code today.

## Theory of Operation

You can't save database/alice-profile.txt because multiple administrators can be logged in to the server. You can't save it even if there is only one user because there maybe a cleanup process running and making an important change to the user profile, for example it can be blacklisting alice for DDoS and if you override that flag the server will crash. Files are simple things, they only work for one user OR one process. Multiple anything will result in overriding important information, in other words: data loss.

### Solution

Don't try to save database/alice-profile.txt but rather save database/alice-profile/60c4db4c-ebba-46c4-b061-f0c3e9fa9c78.txt where 60c4db4c-ebba-46c4-b061-f0c3e9fa9c78 is a random unique ID (UUID/GUID).

### Result

Twelve administrators one file, and no data is lost. What will occur is the creation of twelve files:

- database/alice-profile/35890c38-0bc5-4850-b144-571684b17da6.txt
- database/alice-profile/722ebeee-eef6-40cd-9a56-a948c1144024.txt
- database/alice-profile/798c8045-b151-47d0-a89c-df19ca012a0e.txt
- database/alice-profile/0c09fc0f-0d94-4b49-b08c-3c9336f92211.txt
- database/alice-profile/ce2b80cd-e2a8-4699-9f75-bc5d579b6aba.txt
- database/alice-profile/f58c2518-8fdb-4c70-878a-bb689b547505.txt
- database/alice-profile/2d6f28d7-dcc7-4943-8d6b-5b91edb1e67b.txt
- database/alice-profile/52c7be83-d35c-4150-bf88-8e8fd48774fb.txt
- database/alice-profile/d0d06e8b-bc8c-42a0-9f31-e702ea7eb5d6.txt
- database/alice-profile/6fda9f57-bf72-4bae-8091-4bd4bad09a3c.txt
- database/alice-profile/cd88d433-29b8-4201-a246-d6f1954a3eff.txt
- database/alice-profile/4f0154c6-13db-4c18-8e55-2b5a418b6027.txt

There is no data loss, only confusion as to how to resolve the conflict.

### Conflict Resolution

It can be as simple as sorting the files alphabetically, in this case the winner would be 0c09fc0f-0d94-4b49-b08c-3c9336f92211.txt as it starts with "0" Now that we have one winner and eleven losers we notify the administrator of a conflict, let them look at it and merge all the data, by hand. No data loss, a proper warning is server, a human is called to resolution.

Depending on your use case, the conflict can be automatically merged, for example you can look at the timestamp. Or create an inheritance chain Object.assign'ing all the data in a sequence where the oldest is overridden first.

### A grind in the cogs.

To borrow from Couch DB, we can add the restriction of a revision, and check, right before a write if another copy exists, we can even test, after a write, notifying the user that they lost at automatic conflict resolution an that they need to reload the winning data, and merge it with their now failed attempt at a write.

This would be achieved by introducing a revision prefix:

- database/alice-profile/```3```-35890c38-0bc5-4850-b144-571684b17da6.txt
- database/alice-profile/```5```-722ebeee-eef6-40cd-9a56-a948c1144024.txt
- database/alice-profile/```7```-798c8045-b151-47d0-a89c-df19ca012a0e.txt
- database/alice-profile/```1```-0c09fc0f-0d94-4b49-b08c-3c9336f92211.txt
- database/alice-profile/```3```-ce2b80cd-e2a8-4699-9f75-bc5d579b6aba.txt
- database/alice-profile/```3```-f58c2518-8fdb-4c70-878a-bb689b547505.txt
- database/alice-profile/```3```-2d6f28d7-dcc7-4943-8d6b-5b91edb1e67b.txt
- database/alice-profile/```5```-52c7be83-d35c-4150-bf88-8e8fd48774fb.txt
- database/alice-profile/```3```-d0d06e8b-bc8c-42a0-9f31-e702ea7eb5d6.txt
- database/alice-profile/```6```-6fda9f57-bf72-4bae-8091-4bd4bad09a3c.txt
- database/alice-profile/```7```-cd88d433-29b8-4201-a246-d6f1954a3eff.txt
- database/alice-profile/```9```-4f0154c6-13db-4c18-8e55-2b5a418b6027.txt

Each time an actor is hoping to save data, they get the latest version from the database, in this case 9-4f0154c6-13db-4c18-8e55-2b5a418b6027.txt add their changes, and try to save, if nobody created version 10, they WILL SUCCED, if somebody else created version 10, they will get an edit conflict, and a popup asking them to MANUALLY reconcile changes, you may even let the actors exchange emails/usernames so that they can communicate their intent/schedule to avoid future conflicts.

## A quick note on revision conflicts in a distributed, unreliable, multicore, networked world.

Revision conflicts occur when two actors write at the same time to the same revision number. That is to say, two separate programs requested a copy of an object at the same time/object-state (ex. on a Monday Evening), modified the data and performed an updateObject slipping through the cracks between atomic disk IO and node multiprocessing race conditions at the same time, on High Noon Tuesday.

Revision conflicts occur due to race conditions that emerge between multiple users, multiprocessing, and non-atomic disk IO. Revision conflicts occur in rare conditions, and solving them depends on your particular application.

- If it is a user manager for administrators, flag account as needing attention.
- If it is a wiki, proudly parade the conflict as needing human attention.
- If it is a awesome RGB color generator for your new website, just ignore it.

A new revision of a document means that a conflict is probably not important anymore becasue a new document with a higher revision has been created. However, a conflict inside a previous revision becomes a signal that something may potentially need attention, maybe a bit of information can be moved into the latest revision all the way back from few weeks ago when some administrator made a note on an unreliable network connection somewhere.

Revision conflicts can only be solved by a human in context of a program that is using the store, however there is great potential for auto-solving depending on your specific use case. Consider an event where both a very old conflict and the latest master have matching data for example email:alice@example.com this means that in this particular scenario the old revision conflict can be removed automatically as its data has been captured by the latest revision, be it by chance or because someone looked at the revision and moved that bit of data to the latest revision.

Every revision is a file with a random name, saved in a directory named after the object id: alice-profile/3f700747-033f-486a-afbe-57e4f6662153-3 Whenever a new revision is made, a whole new random filename is generated: alice-profile/ef15f947-fe03-4de9-9926-0745c69373f5-4

To track revisions, the revision number is added to the filename: alice-profile/f94bc318-0ffd-4f13-b258-84420e97601c-5 when document is updated the new information is saved to a new random filename with a higher revision postfix alice-profile/5b4c17f0-546f-47f6-95bb-1a10a107ebeb-6 now.

What you must understand is that when a race condition occurs, it does not endanger the data, information cannot be lost due to random filenames (UUIDs) both operations will succed in saving two separate files, with the same revision number. THe same revision number is then used as a red-flag for discovering that a conflict occured.

Thusly,

User #1 saves: alice-profile/ee30f92d-a785-4603-b0b8-b681b8707e39-3 User #2 saves: alice-profile/56b1d51a-e2b8-4d6c-837b-61af06c6b272-3

No information can be lost, but both will be unaware that they updated the same piece of data unless you quickly check for conflicts and ask either to merge them - depending on use case.

When alice-profile is read, and a conflict is present, the winner is elected by sort() thus in a situation where two revisions are saved at the same time, and we have a tie, we choose the winner by just sorting the randomly generated filename, in effect we toss the dice; and the winner is chosen at random (by means of a random UUID).

## One Thousand Hosts, One Thousand Processes, One Million Revision Conflicts, No Headache.

If you had a 1,000 servers, with 1,000 processes all creating revision 2 of object named important-passwords, thus 1,000 conflicts on 1,000 machines.

If every machine contacted all other 999 machines, and copied their revision data about 1,000 revision files from each of those 999 machines, a total of 1,000,000 files. At the end of the day, they would each arrive at the same state of revision 2, independently agreeing on a single lucky revision file; thus reaching eventual consistency.

If one of those machines made another change later in the night, and saved revision 3 of important-passwords. All those 999 other machines, hoping to synchronize, would only copy that single revision 3 from that host. The other 999 machines would request revision 3.

Again conflict resolution is not a theoretical problem, nor is it a general problem for generic databases, it depends on your particular application, needs, network, customers, administrators, foresight, and technology.
