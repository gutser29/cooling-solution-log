import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { EventRecord, Job, Invoice } from './types'

// ============ COMPANY INFO ============
const COMPANY_NAME = 'Cooling Solution'
const COMPANY_SLOGAN = 'Donde tu confort es nuestra prioridad'
const COMPANY_ADDRESS = 'PO BOX 168'
const COMPANY_CITY = 'Toa Alta, Puerto Rico 00954'
const COMPANY_PHONE = '939-425-6081'
const COMPANY_EMAIL = 'Sergio.gutierrez@coolingsolutionpr.com'

// ============ LOGO BASE64 ============
const LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAASwAAAB9CAIAAACXusnEAABkM0lEQVR42u29d3hcxdX3mZl7t69675LViyVL7pZ7xTa2MaYYTE8o4Q1gOiQQamgGEkKA0AnNGFds3HuXq3rvvdett8x8f1xpvZZkYQghfMmex4+f1e7euXdn5jenn4MYY+AiF7noP0fYNQUuctF/LQhtNsE1vy5y0X8GhJTKAJBzekN5yWkAxhh1TbSLXPSLghBjLIjgwa3rbfsMACHkUjtd5KJfEISMMQDU3tKokg76ehxob+8AwC7zj4tc9EtyQgrAbNZ8o5tdy5d2th0EQAAuidRFLvqlQIgQACCha4uGE9x0smTfJIqAEHLNtYtc9EuAkDEGgNuaGzWWvTyn4hho1XkWqxkAA7gkUhe56BfghIwCoI6GvUauFAFCjKg1VRZL0QA+XeQiF/27QciAIYxMZhtr/8zTyEmUMcrp+L6GmqMDuqKLXOSifysnZBQAl+ds8IKTEnJjSASGCYZR0boBXXEYooy5mKSLXCD8ebRBBKi3zyY2vuvnbpUkCQMng6jVkLKyw1YrAJDhYEsxQgghFw5d5ALhv45CGRBuKvkuXJMlYA1BNixzAqGIIUobAADgIlZIKQWAnKqq29a81drYjBCi1IVDF7lA+NPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPZIEUYt7Q0i+UvehuwnRIEDBAFRJgM3l6I44YqkAAAFlH+VOP9uy37zD09DAF18UMXuUD402EIuLfw7TBdnshUPKMyIgzJHAUGiFfZLqUQIplpw+N3Rqa+sDeLAAOEXDB0kQuEPx5/VEaI1BXu92z8u1pjoBfCtREAYAxms0YexjKKAABxRBTs1C/4r5z/Yxu/B7tdZi6p1EUuEP44BFKESXt7S+/huz3cbKLM0EWfMoShqZFI4rAYBJ3BaCAEbD0k0PdVUf/x4ZMcxjJ1OTNc5ALhj1AFUU+PqWzzTfFedTaqgosTJgjCoizHxE5Tq2Gwn5AxADhTXGrntBwwzmTWxKQ81GT7ft9RFw5d5ALhZSKQIWCijCoOvJiM9kgYY4o4dlFwGsZEsFOrVctxMCirkAEwgGoZW4kWMV4iat7Ua4kc/UxJp2g2I+RKvHCRC4Q/AEFAwERGDnz2B9/69w1avSxrKEaAxIu/JdlFlc4w+oIA6pBGEUIAoocP4nlOkmTMRAx6JBeEx3xyLh8jV3yNi1wgHJEHApNkhGtOfxvf83qoUZBsWoYpIIkx3ulrCHNSj9kPo1GDQMgYIwj1trfvzy8lepUAwFFAwDHJSr08nq/va2ltxS4PvotcILykJQYYxdz3bzyk2ne7n5fWLGnsKpmRPo4CpirnbAkK0GeJ8vKKBGDO2UwKuOo6e2uQgSOMAsYMqSRGMaglVO8T8X5+tSsH0UUuEA5DVJYRxgLDFUe+yjB/EuLFC3ZMiQxY4iSdjJnI2REgAAaAEAbBzjgyS6NFjMnOnJACA4CCzp5OzwBeEgjDMgKZUBl0QE0GjdvHnZa61maMkMt97yIXCJ0RKGFCKsqrtrx4k+7g/3l7YbOM1WDnmJ2jgBjPABCyY0oQU1Ek8xg6+zQGzwUYo6EKIQCcu67EyHU9kRDGjiFIECEDGoGJitcHn/TNFCMDlNHSBC5yAeLPQ=='

// ============ HELPERS ============
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString('es-PR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCurrency(n: number): string {
  return '$' + n.toFixed(2)
}

function getPaymentLabel(method?: string): string {
  if (!method) return 'N/A'
  const labels: Record<string, string> = {
    cash: 'Efectivo', ath_movil: 'ATH Móvil', capital_one: 'Capital One',
    chase_visa: 'Chase Visa', paypal: 'PayPal', check: 'Cheque',
    sams_mastercard: "Sam's MC", transfer: 'Transferencia'
  }
  return labels[method] || method
}

export function generateInvoiceNumber(type: 'invoice' | 'quote'): string {
  const prefix = type === 'invoice' ? 'CS-INV' : 'CS-COT'
  const d = new Date()
  const yr = d.getFullYear().toString().slice(-2)
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `${prefix}-${yr}${mo}-${rand}`
}

// ============ INVOICE PDF - ANTHROPIC STYLE ============
export function generateInvoicePDF(invoice: Invoice): Blob {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const isQuote = invoice.type === 'quote'
  const title = isQuote ? 'Cotización' : 'Factura'
  const marginL = 20
  const marginR = 20
  const contentW = pageW - marginL - marginR

  // === TITLE (top left, large) ===
  doc.setFontSize(32)
  doc.setTextColor(30, 30, 30)
  doc.text(title, marginL, 28)

  // === LOGO (top right) ===
  try {
    doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 40, 12, 40, 17)
  } catch {
    doc.setFontSize(16)
    doc.setTextColor(0, 150, 150)
    doc.text(COMPANY_NAME, pageW - marginR, 22, { align: 'right' })
  }

  // === INVOICE META (below title) ===
  let y = 38
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  
  doc.setFont('helvetica', 'bold')
  doc.text(isQuote ? 'Número cotización' : 'Número factura', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text(invoice.invoice_number, marginL + 45, y)
  
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.text('Fecha emisión', marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(invoice.issue_date), marginL + 45, y)
  
  y += 6
  if (invoice.due_date && !isQuote) {
    doc.setFont('helvetica', 'bold')
    doc.text('Fecha vence', marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(invoice.due_date), marginL + 45, y)
  }
  if (isQuote && invoice.expiration_date) {
    doc.setFont('helvetica', 'bold')
    doc.text('Válida hasta', marginL, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(invoice.expiration_date), marginL + 45, y)
  }

  // === COMPANY INFO (left) & BILL TO (right) - PARALLEL ===
  y = 65
  const colMid = pageW / 2 + 5

  // Company info (left column)
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.text(COMPANY_NAME, marginL, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.text(COMPANY_ADDRESS, marginL, y + 5)
  doc.text(COMPANY_CITY, marginL, y + 10)
  doc.text(COMPANY_PHONE, marginL, y + 15)
  doc.text(COMPANY_EMAIL, marginL, y + 20)

  // Bill to (right column)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Facturar a', colMid, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  let billY = y + 5
  doc.text(invoice.client_name, colMid, billY)
  if (invoice.client_address) {
    billY += 5
    doc.text(invoice.client_address, colMid, billY)
  }
  if (invoice.client_phone) {
    billY += 5
    doc.text(invoice.client_phone, colMid, billY)
  }
  if (invoice.client_email) {
    billY += 5
    doc.text(invoice.client_email, colMid, billY)
  }

  // === AMOUNT DUE HIGHLIGHT ===
  y = 100
  doc.setFontSize(18)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  const dueDateStr = invoice.due_date ? formatDate(invoice.due_date) : ''
  doc.text(`${formatCurrency(invoice.total)} USD${dueDateStr ? ' vence ' + dueDateStr : ''}`, marginL, y)
  doc.setFont('helvetica', 'normal')

  // === ITEMS TABLE ===
  y = 115
  
  // Table header line (subtle gray)
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(marginL, y, pageW - marginR, y)
  
  // Table headers
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text('Descripción', marginL, y)
  doc.text('Cant.', pageW - marginR - 65, y, { align: 'right' })
  doc.text('Precio unit.', pageW - marginR - 30, y, { align: 'right' })
  doc.text('Total', pageW - marginR, y, { align: 'right' })
  
  // Line below headers
  y += 4
  doc.line(marginL, y, pageW - marginR, y)
  
  // Table rows
  y += 8
  doc.setTextColor(30, 30, 30)
  invoice.items.forEach((item) => {
    doc.text(item.description, marginL, y)
    doc.text(String(item.quantity), pageW - marginR - 65, y, { align: 'right' })
    doc.text(formatCurrency(item.unit_price), pageW - marginR - 30, y, { align: 'right' })
    doc.text(formatCurrency(item.total), pageW - marginR, y, { align: 'right' })
    y += 8
  })

  // === TOTALS (right aligned) ===
  y += 8
  const totalsLabelX = pageW - marginR - 50
  
  doc.setTextColor(60, 60, 60)
  doc.text('Subtotal', totalsLabelX, y, { align: 'right' })
  doc.text(formatCurrency(invoice.subtotal), pageW - marginR, y, { align: 'right' })
  
  if (invoice.tax_rate > 0) {
    y += 6
    doc.text(`IVU (${invoice.tax_rate}%)`, totalsLabelX, y, { align: 'right' })
    doc.text(formatCurrency(invoice.tax_amount), pageW - marginR, y, { align: 'right' })
  }
  
  y += 6
  doc.text('Total', totalsLabelX, y, { align: 'right' })
  doc.text(formatCurrency(invoice.total), pageW - marginR, y, { align: 'right' })
  
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Total a pagar', totalsLabelX, y, { align: 'right' })
  doc.text(`${formatCurrency(invoice.total)} USD`, pageW - marginR, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // === NOTES ===
  if (invoice.notes) {
    y += 18
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text('Notas:', marginL, y)
    y += 5
    doc.setTextColor(60, 60, 60)
    const lines = doc.splitTextToSize(invoice.notes, contentW)
    doc.text(lines, marginL, y)
  }

  // === PAYMENT INFO ===
  if (!isQuote && invoice.status !== 'paid') {
    y += 18
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text('Métodos de pago aceptados:', marginL, y)
    y += 5
    doc.text('Efectivo, ATH Móvil, Transferencia, PayPal', marginL, y)
  }

  // === PAID STAMP ===
  if (invoice.status === 'paid' && invoice.paid_date) {
    y += 15
    doc.setFontSize(10)
    doc.setTextColor(34, 197, 94)
    doc.setFont('helvetica', 'bold')
    doc.text(`✓ PAGADO - ${formatDate(invoice.paid_date)} (${getPaymentLabel(invoice.paid_method)})`, marginL, y)
    doc.setFont('helvetica', 'normal')
  }

  // === FOOTER LINE ===
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(marginL, pageH - 18, pageW - marginR, pageH - 18)

  // === FOOTER TEXT ===
  doc.setFontSize(9)
  doc.setTextColor(150, 150, 150)
  doc.text('Página 1 de 1', pageW - marginR, pageH - 10, { align: 'right' })

  return doc.output('blob')
}

// Convenience: download invoice
export function downloadInvoicePDF(invoice: Invoice) {
  const blob = generateInvoicePDF(invoice)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const prefix = invoice.type === 'quote' ? 'Cotizacion' : 'Factura'
  a.href = url
  a.download = `${prefix}-${invoice.invoice_number}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ============ CATEGORY REPORT ============
export function generateCategoryReport(
  events: EventRecord[],
  category: string,
  startDate: number,
  endDate: number
) {
  const filtered = events.filter(e =>
    e.timestamp >= startDate &&
    e.timestamp <= endDate &&
    (category === 'general' || e.category?.toLowerCase() === category.toLowerCase())
  )

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME} - Reporte ${category}`, 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 22)

  if (filtered.length === 0) {
    doc.text('No hay registros para este período.', 14, 35)
  } else {
    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Tipo', 'Categoría', 'Monto', 'Detalle', 'Método']],
      body: filtered.map(e => [
        formatDateShort(e.timestamp),
        e.type === 'income' ? 'Ingreso' : 'Gasto',
        e.category || '-',
        formatCurrency(e.amount),
        e.vendor || e.client || e.note || '-',
        getPaymentLabel(e.payment_method)
      ]),
      headStyles: { fillColor: [0, 150, 150], textColor: [255, 255, 255] },
      bodyStyles: { fontSize: 8 }
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    const totalIncome = filtered.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    const totalExpense = filtered.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    
    doc.setFontSize(10)
    doc.text(`Total Ingresos: ${formatCurrency(totalIncome)}`, 14, finalY)
    doc.text(`Total Gastos: ${formatCurrency(totalExpense)}`, 14, finalY + 6)
    doc.setFont('helvetica', 'bold')
    doc.text(`Neto: ${formatCurrency(totalIncome - totalExpense)}`, 14, finalY + 12)
  }

  doc.save(`Reporte-${category}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ P&L REPORT ============
export function generatePLReport(
  events: EventRecord[],
  startDate: number,
  endDate: number,
  periodLabel: string
) {
  const filtered = events.filter(e => 
    e.timestamp >= startDate && 
    e.timestamp <= endDate &&
    e.expense_type !== 'personal'  // Exclude personal expenses
  )

  const income = filtered.filter(e => e.type === 'income')
  const expenses = filtered.filter(e => e.type === 'expense')
  const totalIncome = income.reduce((s, e) => s + e.amount, 0)
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0)
  const profit = totalIncome - totalExpense

  // Group expenses by category
  const expenseByCategory: Record<string, number> = {}
  expenses.forEach(e => {
    const cat = e.category || 'Otros'
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e.amount
  })

  // Group income by category
  const incomeByCategory: Record<string, number> = {}
  income.forEach(e => {
    const cat = e.category || 'Otros'
    incomeByCategory[cat] = (incomeByCategory[cat] || 0) + e.amount
  })

  const doc = new jsPDF()
  doc.setFontSize(18)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME}`, 14, 15)
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text(`Estado de Pérdidas y Ganancias - ${periodLabel}`, 14, 24)
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 30)

  let y = 42

  // Income section
  doc.setFontSize(11)
  doc.setTextColor(34, 197, 94)
  doc.setFont('helvetica', 'bold')
  doc.text('INGRESOS', 14, y)
  doc.setFont('helvetica', 'normal')
  y += 7

  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
    doc.text(cat, 20, y)
    doc.text(formatCurrency(total), 100, y, { align: 'right' })
    y += 5
  })
  
  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(34, 197, 94)
  doc.text('Total Ingresos', 20, y)
  doc.text(formatCurrency(totalIncome), 100, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // Expenses section
  y += 12
  doc.setFontSize(11)
  doc.setTextColor(239, 68, 68)
  doc.setFont('helvetica', 'bold')
  doc.text('GASTOS', 14, y)
  doc.setFont('helvetica', 'normal')
  y += 7

  doc.setFontSize(9)
  doc.setTextColor(60, 60, 60)
  Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
    doc.text(cat, 20, y)
    doc.text(formatCurrency(total), 100, y, { align: 'right' })
    y += 5
  })

  y += 3
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(239, 68, 68)
  doc.text('Total Gastos', 20, y)
  doc.text(formatCurrency(totalExpense), 100, y, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // Profit line
  y += 12
  doc.setDrawColor(200, 200, 200)
  doc.line(14, y - 3, 110, y - 3)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  const profitColor = profit >= 0 ? [34, 197, 94] : [239, 68, 68]
  doc.setTextColor(profitColor[0], profitColor[1], profitColor[2])
  doc.text(profit >= 0 ? 'GANANCIA NETA' : 'PÉRDIDA NETA', 14, y)
  doc.text(formatCurrency(Math.abs(profit)), 100, y, { align: 'right' })

  // Margin percentage
  if (totalIncome > 0) {
    y += 8
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    const margin = ((profit / totalIncome) * 100).toFixed(1)
    doc.text(`Margen: ${margin}%`, 14, y)
  }

  doc.save(`P&L-${periodLabel.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ AR REPORT (Cuentas por Cobrar) ============
export function generateARReport(invoices: Invoice[]) {
  const pending = invoices.filter(inv => 
    inv.type === 'invoice' && 
    (inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'draft')
  )

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME} - Cuentas por Cobrar`, 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`Generado: ${formatDate(Date.now())}`, 14, 22)

  if (pending.length === 0) {
    doc.setFontSize(12)
    doc.text('🎉 No hay facturas pendientes', 14, 40)
  } else {
    const total = pending.reduce((s, inv) => s + inv.total, 0)
    
    doc.setFontSize(14)
    doc.setTextColor(239, 68, 68)
    doc.text(`Total Pendiente: ${formatCurrency(total)}`, 14, 32)

    autoTable(doc, {
      startY: 40,
      head: [['#', 'Cliente', 'Fecha', 'Vence', 'Status', 'Total']],
      body: pending.map(inv => [
        inv.invoice_number,
        inv.client_name,
        formatDateShort(inv.issue_date),
        inv.due_date ? formatDateShort(inv.due_date) : '-',
        inv.status === 'overdue' ? 'VENCIDA' : inv.status === 'sent' ? 'Enviada' : 'Borrador',
        formatCurrency(inv.total)
      ]),
      headStyles: { fillColor: [0, 150, 150] },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        4: { 
          cellWidth: 25,
          fontStyle: 'bold'
        }
      },
      didParseCell: (data) => {
        if (data.column.index === 4 && data.cell.raw === 'VENCIDA') {
          data.cell.styles.textColor = [239, 68, 68]
        }
      }
    })
  }

  doc.save(`Cuentas-por-Cobrar-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ PAYMENT METHOD REPORT ============
export function generatePaymentMethodReport(
  events: EventRecord[],
  paymentMethod: string,
  startDate: number,
  endDate: number
) {
  const filtered = events.filter(e =>
    e.timestamp >= startDate &&
    e.timestamp <= endDate &&
    e.payment_method?.toLowerCase().includes(paymentMethod.replace(/_/g, ' ').toLowerCase())
  )

  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.setTextColor(0, 150, 150)
  doc.text(`${COMPANY_NAME} - Reporte ${getPaymentLabel(paymentMethod)}`, 14, 15)
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`${formatDate(startDate)} - ${formatDate(endDate)}`, 14, 22)

  if (filtered.length === 0) {
    doc.text('No hay registros para este método de pago.', 14, 35)
  } else {
    const catSummary: Record<string, number> = {}
    filtered.forEach(e => {
      const cat = e.category || 'Otros'
      catSummary[cat] = (catSummary[cat] || 0) + e.amount
    })

    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Categoría', 'Monto', 'Detalle']],
      body: filtered.map(e => [
        formatDateShort(e.timestamp),
        e.category || '-',
        formatCurrency(e.amount),
        e.vendor || e.note || '-'
      ]),
      foot: [['TOTAL', '', formatCurrency(filtered.reduce((s, e) => s + e.amount, 0)), '']]
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.text('Por categoría:', 14, finalY)
    let y = finalY + 7
    doc.setFontSize(9)
    Object.entries(catSummary).sort((a, b) => b[1] - a[1]).forEach(([cat, total]) => {
      doc.text(`${cat}: ${formatCurrency(total)}`, 20, y)
      y += 5
    })
  }

  doc.save(`${paymentMethod}-${new Date().toISOString().split('T')[0]}.pdf`)
}

// ============ PHOTO REPORT (Before/After) ============
interface ClientPhoto {
  id?: number
  client_id?: number
  client_name?: string
  job_id?: number
  category: 'before' | 'after' | 'diagnostic' | 'receipt' | 'other'
  description?: string
  photo_data: string
  timestamp: number
}

export function generatePhotoReport(
  photos: ClientPhoto[],
  clientName: string,
  jobDescription?: string
) {
  if (photos.length === 0) {
    alert('No hay fotos para este reporte')
    return
  }

  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginL = 15
  const marginR = 15
  const contentW = pageW - marginL - marginR

  // === HEADER ===
  doc.setFontSize(18)
  doc.setTextColor(0, 150, 150)
  doc.text(COMPANY_NAME, marginL, 18)
  
  doc.setFontSize(14)
  doc.setTextColor(40, 40, 40)
  doc.text('Reporte Fotográfico', marginL, 28)
  
  doc.setFontSize(10)
  doc.setTextColor(80, 80, 80)
  doc.text(`Cliente: ${clientName}`, marginL, 36)
  if (jobDescription) {
    doc.text(`Trabajo: ${jobDescription}`, marginL, 42)
  }
  doc.text(`Fecha: ${formatDate(Date.now())}`, marginL, jobDescription ? 48 : 42)

  // === LOGO ===
  try {
    doc.addImage('data:image/png;base64,' + LOGO_BASE64, 'PNG', pageW - marginR - 40, 10, 40, 17)
  } catch {}

  // Group photos by category
  const beforePhotos = photos.filter(p => p.category === 'before')
  const afterPhotos = photos.filter(p => p.category === 'after')
  const diagnosticPhotos = photos.filter(p => p.category === 'diagnostic')
  const otherPhotos = photos.filter(p => p.category === 'other' || p.category === 'receipt')

  let y = jobDescription ? 58 : 52
  const imgWidth = 80
  const imgHeight = 60

  // Helper to add photo section
  const addPhotoSection = (title: string, sectionPhotos: ClientPhoto[], startY: number): number => {
    if (sectionPhotos.length === 0) return startY

    // Check if we need new page
    if (startY > pageH - 100) {
      doc.addPage()
      startY = 20
    }

    doc.setFontSize(12)
    doc.setTextColor(0, 150, 150)
    doc.setFont('helvetica', 'bold')
    doc.text(title, marginL, startY)
    doc.setFont('helvetica', 'normal')
    startY += 8

    let x = marginL
    let rowY = startY

    sectionPhotos.forEach((photo, idx) => {
      // Check if we need new page
      if (rowY > pageH - 80) {
        doc.addPage()
        rowY = 20
        x = marginL
      }

      // Add image
      try {
        doc.addImage(photo.photo_data, 'JPEG', x, rowY, imgWidth, imgHeight)
      } catch {
        // If image fails, draw placeholder
        doc.setDrawColor(200, 200, 200)
        doc.rect(x, rowY, imgWidth, imgHeight)
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text('Imagen no disponible', x + 15, rowY + 30)
      }

      // Add description below image
      if (photo.description) {
        doc.setFontSize(8)
        doc.setTextColor(60, 60, 60)
        const descLines = doc.splitTextToSize(photo.description, imgWidth)
        doc.text(descLines.slice(0, 2), x, rowY + imgHeight + 4)
      }

      // Add timestamp
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 120)
      doc.text(formatDateShort(photo.timestamp), x, rowY + imgHeight + (photo.description ? 12 : 4))

      // Move to next position (2 images per row)
      if ((idx + 1) % 2 === 0) {
        x = marginL
        rowY += imgHeight + 20
      } else {
        x = marginL + imgWidth + 10
      }
    })

    // If odd number of photos, move to next row
    if (sectionPhotos.length % 2 !== 0) {
      rowY += imgHeight + 20
    }

    return rowY + 5
  }

  // Add sections
  y = addPhotoSection('📷 ANTES', beforePhotos, y)
  y = addPhotoSection('✅ DESPUÉS', afterPhotos, y)
  y = addPhotoSection('🔍 DIAGNÓSTICO', diagnosticPhotos, y)
  y = addPhotoSection('📎 OTROS', otherPhotos, y)

  // === FOOTER on last page ===
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(marginL, pageH - 15, pageW - marginR, pageH - 15)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(COMPANY_SLOGAN, pageW / 2, pageH - 8, { align: 'center' })
    doc.text(`Página ${i} de ${totalPages}`, pageW - marginR, pageH - 8, { align: 'right' })
  }

  const safeName = clientName.replace(/[^a-zA-Z0-9]/g, '-')
  doc.save(`Fotos-${safeName}-${new Date().toISOString().split('T')[0]}.pdf`)
}