//FB2 to TXT
function convertFb2ToTxt(fb2String) {
    const parser = new DOMParser();
    const fb2Doc = parser.parseFromString(fb2String.replace(/<p>/g, "\n<p>"), 'application/xml');
    let textContent = '';
    const bodyNode = fb2Doc.getElementsByTagName('body')[0];
    if (bodyNode) {
        const sectionNodes = bodyNode.getElementsByTagName('section');
        for (let i = 0; i < sectionNodes.length; i++) {
            const sectionNode = sectionNodes[i];
            const sectionText = sectionNode.textContent;
            textContent += sectionText + '\n\n';
        }
    }
    const txtString = textContent.trim();
    return txtString;
}

//EPUB to TXT
async function convertEpubToTxt(epubBinary) {
    const zip = await JSZip.loadAsync(epubBinary);
    const textFiles = [];
	// Le fichier de sommaire .ncx n'est pas toujours nommé "toc.ncx" (certains éditeurs le
	// nomment différemment, ex: "_toc_ncx_.ncx") : on utilise son chemin réel tel quel,
	// plutôt que de supposer un nom fixe.
	var ncx_full_path = ""
	zip.forEach((relativePath, zipEntry) => {
		if ( zipEntry.name.toLowerCase().endsWith('.ncx') ) {
			ncx_full_path = zipEntry.name
		}
	});
	const toc_path = ncx_full_path.includes('/') ? ncx_full_path.slice(0, ncx_full_path.lastIndexOf('/') + 1) : ""

    const toc = await zip.file(ncx_full_path).async('text');
    const parser = new DOMParser();
    const tocDoc = parser.parseFromString(toc, 'application/xml');
    const navPoints = tocDoc.getElementsByTagName('navPoint');
    for (let i = 0; i < navPoints.length; i++) {
        const src = toc_path + navPoints[i].getElementsByTagName('content')[0].getAttribute('src').split("#")[0];
        const file = zip.file(src);
        if (file) {
            textFiles.push(file);
        }
    }
    let textContent = '';
    for (const file of textFiles) {
        const fileText = await file.async('text');
        const htmlDoc = parser.parseFromString(fileText, 'application/xhtml+xml');
        const bodyNode = htmlDoc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'body')[0];
        if (bodyNode) {
            const textNodes = bodyNode.childNodes;
            for (let i = 0; i < textNodes.length; i++) {
                const node = textNodes[i];
                if (node.textContent.trim() !== '') {
                    textContent += node.textContent.trim() + '\n';
                }
            }
            textContent += '\n\n';
        }
    }
    return await textContent.trim();
}


//ZIP to TXT
function convertZipToTxt(zipFile) {

    JSZip.loadAsync(zipFile)
    .then(function (zip) {
        zip.forEach(function (relativePath, file) {
			const file_name_toLowerCase = file.name.toLowerCase()
			if ( file_name_toLowerCase.endsWith('.txt') ) {
				file.async('text').then( result => get_text(file.name.slice(0, file.name.lastIndexOf(".")), result, true, "", "", "") )
			} else if ( file_name_toLowerCase.endsWith('.fb2') ) {
				file.async('text').then( result => get_text(file.name.slice(0, file.name.lastIndexOf(".")), convertFb2ToTxt(result), true, "", "", "") )
			} else if ( file_name_toLowerCase.endsWith('.epub') ) {
				file.async('ArrayBuffer').then( result => unzip_epub(file, result) )
			}
        })
    }, function (e) {
        console.log(e.message)
    })
}

function unzip_epub(file, file_text) {
	const blob = new Blob([file_text], { type: 'application/epub+zip' });
	const epub_file = new File([blob], 'my_epub_file_name.epub', { type: 'application/epub+zip' });
	convertEpubToTxt(epub_file).then(result => get_text(file.name.slice(0, file.name.lastIndexOf(".")), result, true, "", "", ""))
}
